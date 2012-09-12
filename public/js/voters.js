jQuery(function ($) {

    var voterRowTemplate = _.template($('#voter-row-template').html()),
        status;

    var Line = Backbone.Model.extend({
        initialize: function () {
            var line = this; // save to use in inner function
            this.saved = !this.isNew();
            this.on('change', this.setUnsaved, this);
            this.on('sync', this.setSaved, this);
            window.onbeforeunload = function () {
                if (!line.saved) {
                    return 'The form has not been submitted.';
                }
            };
        },
        urlRoot: '/voters/line',
        setSaved: function () {
            this.saved = true;
        },
        setUnsaved: function () {
            this.saved = false;
        }
    });

    var LineView = Backbone.View.extend({
        template: _.template($('#line-template').html()),
        initialize: function () {
            this.modelBinder = new Backbone.ModelBinder();
            this.render();
        },
        events: {
            'click #save': 'save',
            'click #show-json': 'showJson'
        },
        render: function () {
            var html = this.template(this.model.toJSON());
            this.$el.html(html);
            this.modelBinder.bind(this.model, this.el);
            return this;
        },
        save: function () {
            var jqXhr = this.model.save(),
                alertTemplate = _.template($('#alert-template').html()),
                showAlert = function (successful) {
                    $('#form-line').before(alertTemplate({successful: successful}));
                };
            if (jqXhr) {
                jqXhr.done(function () { showAlert(true); })
                    .fail(function () { showAlert(false); });
            }
            else {
                showAlert(false);
            }
        },
        showJson: function () {
            this.$('#survey-json').text(JSON.stringify(this.model, null, 2))
                .modal();
            return false;
        }
    });

    function makeName(v, reversed) {
        var name = v.firstname;
        if (v.middle) {
            name += ' ' + v.middle;
        }
        if (reversed) {
            name = v.lastname + ', ' + name;
        }
        else {
            name += ' '  + v.lastname;
        }
        if (v.suffix) {
            if (reversed) {
                name += ',';
            }
            name += ' ' + v.suffix;
        }
        return name;
    }

    function makeAddress(v) {
        var address = v.res_house + v.res_frac + ' ' + v.res_street;
        if (v.res_apt) {
            address += ' #' + v.res_apt;
        }
        return address;
    }

    function getStatus(callback) {
        $.ajax({
            url: '/voters/status',
            dataType: 'json',
            success: function (data) {
                status = data;
                callback(null, status); // null for no error
            },
            error: function (jqXhr, textStatus, errorThrown) {
                callback('Unexpected problem: ' + textStatus + ' (' + errorThrown + ')');
            }
        });
    }

    function start() {
        getStatus(function (err, status) {
            if (err) {
                alert(err);
            }
            var form = $('#form-check'),
                p = $('#check-results'),
                rec = status.lineRecord,
                statusDiv = $('#status');
            $('.username', statusDiv).text(status.user || '(anonymous)');
            $('.complete', statusDiv).text(status.complete);
            $('.total', statusDiv).text(status.incomplete + status.complete);
            if (rec) {
                $('[name=page]', form).val(rec.page);
                $('[name=line]', form).val(rec.line);
            }
            else if (status.complete) {
                p.text('You have finished all your assigned petitions. Congratulations! And thank you!');
            }
            else {
                p.text('You have not yet been assigned any petitions.');
            }
            p.show();
        });
    }

    start();

    $('#results')
        .on('dblclick', 'td', function () { selectText(this); })
        .on('click', '.match', function () {
            var voterData = $(this).closest('tr').data('voterData'),
                lineData = $.extend({}, $('#form-check').data('lineData'),
                    {
                        voter_id: voterData.voter_id,
                        voter_name: makeName(voterData),
                        address: makeAddress(voterData),
                        ward: voterData.ward
                    }
                );
            console.log(lineData);
            $('#result-div table, #explanation').addClass('hide');
            new LineView({el: $('#form-line'), model: new Line(lineData)});
        });

    $('#form-check')
        .on('click', '#check-button', function () {
            $('#form-check, #check-results').hide();
            $('#form-search').show();
        })
        .on('click', '#blank-button, #rest-blank-button', function () {
            var rest = this.id.match(/^rest/),
                form = $('#form-check'),
                page = +$('[name=page]', form).val(),
                line = +$('[name=line]', form).val(),
                url = '/voters/mark-blank/' + page + '/' + line;
            if (rest) {
                url += '-' + 20;
            }
            $.ajax({
                url: url,
                type: 'post',
                dataType: 'json',
                success: function (data) {
                    start();
                }
            });
        });

    // Somewhat klugy way to handle logging out of HTTP authentication
    // by forcing a login with bad credentials
    $('#log-out').on('click', function (evt) {
        evt.preventDefault();
        $.ajax({
            url: '/voters/status',
            dataType: 'json',
            username: '---',
            password: '',
            complete: function () {
                location.href = '/';
            }
        });
    });

    $('#form-search').submit(function (evt) {
        var searchData = {},
            button = $('#search-button'),
            resetButton = function () {
                button.text('Search').removeAttr('disabled');
            },
            timeoutHandle;
        evt.preventDefault();
        $.each(['q', 'name', 'address'], function (i, name) {
            var value = $.trim($('#' + name).val());
            if (value) {
                searchData[name] = value;
            }
        });
        if ($.isEmptyObject(searchData)) {
            return; // don't search if no search terms
        }
        button.text('Please Wait').attr('disabled', 'disabled');
        $('#results, #explanation').empty();
        // Use a timeout because JSONP calls don't always raise error
        // events when there's a problem.
        timeoutHandle = setTimeout(
            function () {
                alert('Something unexpected went wrong with the search request. Trying again might work.');
                resetButton();
            },
            10000
        );
        $.ajax({
            url: '/search',
            data: searchData,
            dataType: 'json',
            success: handleResults,
            complete: function () {
                clearTimeout(timeoutHandle);
                resetButton();
            }
        });
    });

    function handleResults(data) {
        var tbody = $('#results'),
            results = data.results;
        $('#result-div table').toggleClass('hide', results.length ? false : true);
        $('#none-found').toggleClass('hide', results.length ? true : false);
        $.each(results, function (i, v) {
            var tr;
            v.name = makeName(v, true); // reversed
            v.address = makeAddress(v);
            tr = $(voterRowTemplate(v)).data('voterData', v);
            tbody.append(tr);
        });
        $('#explanation').append(data.explanation).removeClass('hide');
    }

    // Adapted from http://stackoverflow.com/questions/985272/jquery-selecting-text-in-an-element-akin-to-highlighting-with-your-mouse
    function selectText(element) {
        var doc = document,
            range, selection;

        if (doc.body.createTextRange) { // ms
            range = doc.body.createTextRange();
            range.moveToElementText(element);
            range.select();
        } else if (window.getSelection) { // moz, opera, webkit
            selection = window.getSelection();
            range = doc.createRange();
            range.selectNodeContents(element);
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }

});

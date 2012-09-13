jQuery(function ($) {

    var voterRowTemplate = _.template($('#voter-row-template').html()),
        checkFormTemplate = _.template($('#check-form-template').html()),
        dcptCodes = {
            B: 'blank',
            A: 'address change',
            I: 'illegible',
            NR: 'not registered',
            OK: 'OK (name and address match)'
        },
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
        html: _.template($('#line-form-template').html(), {codes: dcptCodes}),
        initialize: function () {
            this.modelBinder = new Backbone.ModelBinder();
            this.render();
        },
        events: {
            'click #save': 'save',
            'click #show-json': 'showJson'
        },
        render: function () {
            this.$el.html(this.html);
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
                jqXhr.done(function () {
                        showAlert(true);
                        setTimeout(function () {
                            $('#form-line').prev().alert('close');
                            start();
                        }, 3000);
                    })
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
            var statusDiv = $('#status'),
                rec = status.lineRecord || {};
            $('.username', statusDiv).text(status.user || '(anonymous)');
            $('.complete', statusDiv).text(status.complete);
            $('.total', statusDiv).text(status.incomplete + status.complete);
            if (rec.line) {
                $('#page-line').html('Petition Page ' + rec.page + ', Line ' + rec.line)
                    .show();
            }
            else {
                $('#page-line').hide();
            }
            $('#check-form').html(
                checkFormTemplate({
                    page: rec.page,
                    line: rec.line,
                    complete: status.complete
                })
            ).show();
            $('#search-form, #result-div > *').hide();
        });
    }

    start();

    $('#results')
        .on('dblclick', 'td', function () { selectText(this); })
        .on('click', '.match', function () {
            var voterData = $(this).closest('tr').data('voterData'),
                rec = status.lineRecord || {},
                lineData = $.extend({}, status.lineRecord,
                    {
                        checker: status.user,
                        voter_id: voterData.voter_id,
                        voter_name: makeName(voterData),
                        address: makeAddress(voterData),
                        ward: voterData.ward
                    }
                );
            console.log(lineData);
            $('#result-div table, #explanation').hide();
            new LineView({el: $('#line-form').show(), model: new Line(lineData)});
        });

    $('#check-form')
        .on('click', '#check-button', function () {
            $('#check-form, #check-results').hide();
            $('#search-form').show();
        })
        .on('click', '#blank-button, #rest-blank-button', function () {
            var rest = this.id.match(/^rest/),
                rec = status.lineRecord,
                url = '/voters/mark-blank/' + rec.page + '/' + rec.line;
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

    $('#search-form').submit(function (evt) {
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
        $('#result-div table').toggle(results.length ? true : false);
        $('#none-found').toggle(results.length ? false : true);
        $.each(results, function (i, v) {
            var tr;
            v.name = makeName(v, true); // reversed
            v.address = makeAddress(v);
            tr = $(voterRowTemplate(v)).data('voterData', v);
            tbody.append(tr);
        });
        $('#explanation').append(data.explanation).show();
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

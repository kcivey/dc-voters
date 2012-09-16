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
            'click #checkmark-button': 'appendCheckmark',
            'change #date_signed': 'checkDateSigned',
            'click #show-json': 'showJson'
        },
        checkDateSigned: function () {
            // This is a mess. Need proper date functions.
            var input = this.$('#date_signed'),
                value = input.val(),
                currentYear = (new Date).getFullYear(),
                parts, i, dd, mm, yy;
            if (!value) {
                return;
            }
            if (parts = value.match(/\d+/g)) {
                mm = +parts[0];
                dd = +parts[1];
                yy = +(parts[2] || currentYear);
                if (yy < 100) {
                    yy += 2000;
                }
                if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12 && yy == currentYear) {
                    if (dd < 10) {
                        dd = '0' + dd;
                    }
                    if (mm < 10) {
                        mm = '0' + mm;
                    }
                    input.val(mm + '/' + dd + '/' + yy);
                    return;
                }
            }
            input.focus();
        },
        appendCheckmark: function () {
            var markings = this.model.get('boe_markings');
            this.model.set('boe_markings', markings + '\u2713'); // append checkmark
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
                    $('#line-form').before(alertTemplate({successful: successful}));
                };
            if (jqXhr) {
                jqXhr.done(function () {
                        showAlert(true);
                        setTimeout(function () {
                            $('#line-form').prev().alert('close');
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
            setStatus(status);
        });
    }

    function setStatus(status) {
        var statusDiv = $('#status'),
            rec = status.lineRecord || {},
            total = status.incomplete + status.complete;
        $('.username', statusDiv).text(status.user || '(anonymous)');
        $('.complete', statusDiv).text(status.complete);
        $('.total', statusDiv).text(total);
        $('#complete-bar').width(total ? (100 * status.complete / total) + '%' : 0);
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
    }

    start();

    function editLine(lineData) {
        lineData = $.extend({}, status.lineRecord, {checker: status.user},
            lineData);
        if (lineData.date_signed) {
            lineData.date_signed = lineData.date_signed
                .replace(/^(\d{4})-(\d\d)-(\d\d).*/, '$2/$3/$1');
        }
        $('#voter-table, #explanation').hide();
        new LineView({el: $('#line-form').show(), model: new Line(lineData)});
    }

    $('#voter-table')
        .on('dblclick', 'td', function () { selectText(this); })
        .on('click', '.match', function () {
            var voterData = $(this).closest('tr').data('voterData');
            editLine({
                voter_id: voterData.voter_id,
                voter_name: makeName(voterData),
                address: makeAddress(voterData),
                ward: voterData.ward
            });
        })
        .on('click', '.not-found', function () {
            editLine({dcpt_code: 'NR'});
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
        })
        .on('click', '#illegible-button', function () {
            editLine({dcpt_code: 'I'});
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

    $('#see-work').on('click', function (evt) {
        evt.preventDefault();
        var link = $(this),
            seeWork = link.text() == 'See Work',
            dataTable;
        console.log('click See Work', seeWork);
        $('#top-row').toggle(!seeWork);
        if (seeWork) {
            link.text('Back');
            $('#bottom-row').show().html($('#line-table-template').html());
            dataTable = $('#line-table').dataTable({
                sAjaxSource: '/voters/dt-line/' + status.user,
                bProcessing: true,
                bServerSide: true,
                bDestroy: true,
                iDisplayLength: 25,
                sDom: '<"row-fluid"<"span6"><"span6"f>r>t<"row-fluid"<"span6"i><"span6">p>',
                bSortClasses: false,
                aaSorting: [], // no sorting by default
                bDeferRender: true,
                aoColumns: [
                    {
                        mDataProp: 'page',
                        sTitle: 'Page',
                        bSearchable: false
                    },
                    {
                        mDataProp: 'line',
                        sTitle: 'Line',
                        bSearchable: false
                    },
                    {
                        mDataProp: 'checker',
                        sTitle: 'Checker',
                        bSearchable: false
                    },
                    {
                        mDataProp: 'check_time',
                        sTitle: 'Check Time',
                        bSearchable: false,
                        fnCreatedCell: function (nTd, sData) {
                            $(nTd).wrapInner('<time datetime="' + sData + '"></time>')
                                .find('time').timeago();
                        }
                    },
                    {
                        mDataProp: 'boe_markings',
                        sTitle: 'BOE Markings',
                        bSearchable: false
                    },
                    {
                        mDataProp: 'voter_id',
                        sTitle: 'Voter ID',
                        bSearchable: false
                    },
                    {
                        mDataProp: 'dcpt_code',
                        sTitle: 'DCPT Code',
                        bSearchable: false
                    },
                    {
                        mDataProp: 'voter_name',
                        sTitle: 'Name',
                        bSearchable: true
                    },
                    {
                        mDataProp: 'address',
                        sTitle: 'Address',
                        bSearchable: true
                    },
                    {
                        mDataProp: 'ward',
                        sTitle: 'Ward',
                        bSearchable: true
                    },
                    {
                        mDataProp: function (oData) {
                            return oData.date_signed ?
                                oData.date_signed.replace(/^(\d{4})-(\d\d)-(\d\d).*/, '$2/$3') : '';
                        },
                        sTitle: 'Date',
                        bSearchable: true
                    },
                    {
                        mDataProp: 'notes',
                        sTitle: 'Notes',
                        bSearchable: true
                    },
                    {
                        mDataProp: function () {
                            return '<button type="button" class="btn btn-mini edit-button">Edit</button>'
                        },
                        sTitle: '',
                        bSearchable: false,
                        bSortable: false
                    }
                ]
            });
            $('#line-table').on('click', '.edit-button', function () {
                var row = $(this).closest('tr'),
                    dataTable = row.closest('table').dataTable({bRetrieve: true}),
                    lineData = dataTable.fnGetData(row[0]);
                $('#see-work').click();
                status.lineRecord = lineData;
                setStatus(status);
                editLine(lineData);
            });

        }
        else {
            $('#bottom-row').hide().empty();
            link.text('See Work');
        }
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
        $('#voter-table tbody, #explanation').empty();
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
        var tbody = $('#voter-table tbody'),
            results = data.results;
        $('#voter-table').toggle(results.length ? true : false);
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

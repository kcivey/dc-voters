jQuery(function ($) {

    var voterRowTemplate = _.template($('#voter-row-template').html()),
        skippedRowTemplate = _.template($('#skipped-row-template').html()),
        checkFormTemplate = _.template($('#check-form-template').html()),
        alertTemplate = _.template($('#alert-template').html()),
        dcptCodes = {
            OK: 'OK (name and address match)',
            A: 'address change',
            AM: 'address change with multiple possibilities',
            NM: 'possible name variation/change (address matches)',
            NR: 'not registered',
            I: 'illegible',
            MD: 'missing date',
            B: 'blank',
            S: 'skip for now and deal with it later'
        },
        status = {},
        lineView;

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
                currentYear = (new Date()).getFullYear(),
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
        showAlert: function (successful, text) {
            var alert = $(alertTemplate({successful: successful, text: text || ''}));
            // remove any earlier alerts
            while (this.$el.prev().hasClass('alert')) {
                this.$el.prev().remove();
            }
            return alert.insertBefore(this.$el);
        },
        save: function () {
            var error = this.check(),
                that = this, // save to use in inner functions
                jqXhr;
            if (!error && (jqXhr = this.model.save())) {
                jqXhr
                    .done(function (data) {
                        var message = 'Record saved for page ' + data.page +
                                ', line ' + data.line,
                            alert = that.showAlert(true, message),
                            timeoutHandle = setTimeout(function () {
                                alert.alert('close');
                            }, 4000);
                        alert.on('closed', function () {
                            clearTimeout(timeoutHandle);
                        });
                        status.defaultDateSigned = that.model.get('date_signed');
                        start();
                    })
                    .fail(function () { that.showAlert(false); });
            }
            else {
                this.showAlert(false, error);
            }
        },
        check: function () {
            var line = this.model;
            if (!line.get('dcpt_code')) {
                return 'Missing DCPT finding';
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
            cache: false,
            success: function (data) {
                // If we're still on the same page, keep the date signed
                if (status.lineRecord && status.lineRecord.page == data.lineRecord.page) {
                    data.defaultDateSigned = status.defaultDateSigned;
                }
                // Reload page if version has changed
                if (status.version && status.version != data.version) {
                    window.location.reload();
                }
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

    function commify(n) {
        return n.toString().replace(/(\d)(?=\d{3}$)/, '$1,');
    }

    function setStatus(status) {
        var statusDiv = $('#status'),
            rec = status.lineRecord || {},
            total = status.incomplete + status.complete,
            overall = status.overall,
            overallTotal = overall.incomplete + overall.complete;
        $('#username', statusDiv).text(status.user || '(anonymous)');
        $('.complete', statusDiv).text(commify(status.complete));
        $('.total', statusDiv).text(commify(total));
        $('#complete-bar').width(total ? (100 * status.complete / total) + '%' : 0);
        $('.overall-complete', statusDiv).text(commify(overall.complete));
        $('.overall-total', statusDiv).text(commify(overallTotal));
        $('#overall-complete-bar').width(overallTotal ? (100 * overall.complete / overallTotal) + '%' : 0);
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
        $('#result-div .alert').insertAfter($('#check-form'));
        $('#search-form, #result-div > *').hide();
        showSkippedLines(status.skippedLines);
    }

    function showSkippedLines(lines) {
        var table = $('#skipped-table'),
            tbody = $('tbody', table).empty();
        if (!lines.length) {
            table.hide();
            return;
        }
        $.each(lines, function (i, line) {
            tbody.append(skippedRowTemplate(line));
        });
        table.show();
    }

    start();

    function editLine(lineData) {
        var lineForm = $('#line-form');
        lineData = $.extend(
            status.lineRecord,
            {checker: status.user},
            lineData
        );
        if (lineData.date_signed) {
            lineData.date_signed = lineData.date_signed
                .replace(/^(\d{4})-(\d\d)-(\d\d).*/, '$2/$3/$1');
        }
        else {
            lineData.date_signed = status.defaultDateSigned;
        }
        $('#voter-table, #explanation').hide();
        if (lineView) {
            lineView.model = new Line(lineData);
            lineView.render();
        }
        else {
            lineView = new LineView({el: lineForm, model: new Line(lineData)});
        }
        $('#result-div > *').hide();
        lineForm.show();
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
            $('#check-form, #check-results, #line-form').hide();
            $('#check-form').next('.alert').remove(); // remove leftover alert if there
            $('#search-form').show();
            $('#reset-button').click(); // clear search form
            $('#name').focus();
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
            cache: false,
            complete: function () {
                location.href = '/';
            }
        });
    });

    $('#review-links').on('click', 'a', function (evt) {
        evt.preventDefault();
        var linkText = $(this).text(),
            dataTable, url;
        if (/^Back/.test(linkText)) {
            $('#top-row').show();
            $('#bottom-row').hide().empty();
            start();
            return;
        }
        $('#top-row').hide();
        $('#bottom-row').show().html($('#line-table-template').html());
        url = '/voters/dt-line/' + status.user;
        if (/skipped/i.test(linkText)) {
            url += '?filterColumn=dcpt_code&filterValue=S';
        }
        dataTable = $('#line-table').dataTable({
            sAjaxSource: url,
            bProcessing: true,
            bServerSide: true,
            bDestroy: true,
            iDisplayLength: 25,
            sDom: '<"row-fluid"<"span6 go-back"><"span6"f>r>t<"row-fluid"<"span6"i><"span6">p>',
            bSortClasses: false,
            aaSorting: [], // no sorting by default
            bDeferRender: true,
            fnInitComplete: function () {
                var button = $('<button type="button"/>')
                    .text('Back to Checking')
                    .addClass('btn')
                    .click(function () {
                        $('#go-back').click(); // kluge
                    });
                $('.go-back').html(button);
            },
            aoColumns: [
                {
                    mDataProp: 'page',
                    sTitle: 'Page',
                    sClass: 'right',
                    sWidth: 40,
                    aDataSort: [0, 1],
                    bSearchable: false
                },
                {
                    mDataProp: 'line',
                    sTitle: 'Line',
                    sClass: 'right',
                    sWidth: 40,
                    aDataSort: [0, 1],
                    bSearchable: false
                },
                /*
                {
                    mDataProp: 'checker',
                    sTitle: 'Checker',
                    bSearchable: false
                },
                */
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
                    sTitle: 'BOE',
                    sWidth: 50,
                    bSearchable: false
                },
                {
                    mDataProp: 'voter_id',
                    sTitle: 'Voter ID',
                    sWidth: 50,
                    bSearchable: false
                },
                {
                    mDataProp: 'dcpt_code',
                    sTitle: 'DCPT',
                    sWidth: 40,
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
                    sWidth: 40,
                    bSearchable: true
                },
                {
                    mDataProp: function (oData) {
                        return oData.date_signed ?
                            oData.date_signed.replace(/^(\d{4})-(\d\d)-(\d\d).*/, '$2/$3') : '';
                    },
                    sTitle: 'Date',
                    sWidth: 50,
                    bSearchable: true
                },
                {
                    mDataProp: 'notes',
                    sTitle: 'Notes',
                    bSearchable: true,
                    bSortable: false
                },
                {
                    mDataProp: function () {
                        return '<button type="button" class="btn btn-mini edit-button">Edit</button>';
                    },
                    sTitle: '',
                    sWidth: 30,
                    bSearchable: false,
                    bSortable: false
                }
            ]
        });
        $('#line-table').on('click', '.edit-button', function () {
            var row = $(this).closest('tr'),
                lineData = dataTable.fnGetData(row[0]);
            status.lineRecord = lineData;
            $('#top-row').show();
            $('#bottom-row').hide().empty();
            setStatus(status);
            editLine(lineData);
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
        $('#voter-table tbody, #explanation').empty();
        $('#result-div > *').hide();
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
        $('#result-div > *').hide();
        $('#voter-table').show();
        $.each(results, function (i, v) {
            var tr;
            v.name = makeName(v, true); // reversed
            v.address = makeAddress(v);
            tr = $(voterRowTemplate(v)).data('voterData', v);
            tbody.append(tr);
        });
        if (!results.length) {
            tbody.append(
                '<tr><td colspan="7"><i>No matching voter records found.</i></td></tr>'
            );
        }
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

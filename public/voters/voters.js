jQuery(function ($) {

    var urlBase = '/voters/',
        voterRowTemplate = _.template($('#voter-row-template').html()),
        checkFormTemplate = _.template($('#check-form-template').html()),
        alertTemplate = _.template($('#alert-template').html()),
        userTableTemplate = _.template($('#user-table-template').html()),
        totalTableTemplate = _.template($('#total-table-template').html()),
        findingCodes = {
            OK: 'OK (name and address match)',
            A: 'address change',
            NM: 'possible name variation/change (address matches)',
            NR: 'not registered',
            I: 'illegible',
            MD: 'missing date',
            MS: 'missing signature',
            B: 'blank',
            S: 'skip for now and deal with it later'
        },
        extraFields = {},
        status = {},
        lineView, searchTimeout;

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
        urlRoot: urlBase + 'line',
        setSaved: function () {
            this.saved = true;
        },
        setUnsaved: function () {
            this.saved = false;
        }
    });

    var LineView = Backbone.View.extend({
        html: _.template($('#line-form-template').html(), {findingCodes: findingCodes, extraFields: extraFields}),
        initialize: function () {
            this.modelBinder = new Backbone.ModelBinder();
            this.render();
        },
        events: {
            'click #save': 'save',
            'change #date_signed': 'checkDateSigned'
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
                    .fail(function (err) {
                        console.log(err);
                        that.showAlert(false);
                    });
            }
            else {
                this.showAlert(false, error);
            }
        },
        check: function () {
            var line = this.model;
            if (!line.get('finding')) {
                return 'Missing finding';
            }
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
            url: urlBase + 'status',
            dataType: 'json',
            cache: false,
            success: function (data) {
                // If we're still on the same page, keep the date signed
                if (status.lineRecord && data.lineRecord && status.lineRecord.page == data.lineRecord.page) {
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
            if (!status.user.admin) {
                $('.admin-only').remove();
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
        $('#username', statusDiv).text(status.user.username || '(anonymous)');
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
        if (rec.finding) {
            $('#check-form').hide();
            $('#search-form').show();
            editLine(rec);
        }
        else {
            $('#check-form').html(
                checkFormTemplate({
                    page: rec.page,
                    line: rec.line,
                    complete: status.complete,
                    admin: status.user.admin
                })
            ).show();
            $('#result-div .alert').insertAfter($('#check-form'));
            $('#search-form, #result-div > *').hide();
        }
    }

    start();

    function editLine(lineData) {
        var lineForm = $('#line-form');
        if (searchTimeout) {
            clearTimeout(searchTimeout);
            searchTimeout = null;
        }
        lineData = $.extend(
            status.lineRecord,
            {checker: status.user.username},
            lineData
        );
        if (lineData.date_signed) {
            lineData.date_signed = lineData.date_signed
                .replace(/^(\d{4})-(\d\d)-(\d\d).*/, '$2/$3/$1');
        }
        else {
            lineData.date_signed = status.defaultDateSigned;
        }
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
            editLine({finding: 'NR'});
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
                url = urlBase + 'mark-blank/' + rec.page + '/' + rec.line;
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
            editLine({finding: 'I'});
        })
        .on('click', '.edit-button', function () {
            var form = $('#check-form'),
                page = +$('[name=page]', form).val(),
                line = +$('[name=line]', form).val();
            $.ajax({
                url: urlBase + 'line/' + page + '/' + line,
                cache: false,
                dataType: 'json',
                success: function (lineRecord) {
                    status.lineRecord = lineRecord;
                    setStatus(status);
                },
                error: function (jqXhr, textStatus, errorThrown) {
                    var message = textStatus + ' (' + errorThrown + ')',
                        alert = $(alertTemplate({successful: false, text: message})),
                        timeoutHandle = setTimeout(function () {
                            alert.alert('close');
                        }, 2500);
                    // remove any earlier alerts
                    while (form.next().hasClass('alert')) {
                        form.next().remove();
                    }
                    alert.insertAfter(form)
                        .on('closed', function () {
                            clearTimeout(timeoutHandle);
                        });
                }
            });
        });

    // Somewhat klugy way to handle logging out of HTTP authentication
    // by forcing a login with bad credentials
    $('#log-out').on('click', function (evt) {
        evt.preventDefault();
        $.ajax({
            url: urlBase + 'status',
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
            value = $(this).data('value'),
            dataTable, url;
        if (/^Back/.test(linkText)) {
            backToChecking();
            return;
        }
        $('#top-row').hide();
        $('#bottom-row').show().html($('#line-table-template').html());
        url = urlBase + 'dt-line';
        if (!status.user.admin) {
            url += '/' + status.user.username;
        }
        if (value) {
            url += '?filterColumn=finding&filterValue=' + value;
        }
        dataTable = $('#line-table').dataTable({
            sAjaxSource: url,
            bProcessing: true,
            bServerSide: true,
            bDestroy: true,
            iDisplayLength: 25,
            sDom: '<"row-fluid"<"span6 dt-top-left"><"span6"f>r>t<"row-fluid"<"span6"i><"span6">p>',
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
                $('.dt-top-left').html(button);
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
                    mDataProp: 'voter_id',
                    sTitle: 'Voter ID',
                    sWidth: 50,
                    bSearchable: false
                },
                {
                    mDataProp: 'finding',
                    sTitle: 'Finding',
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

    function backToChecking() {
        $('#top-row').show();
        $('#bottom-row').hide().empty();
        start();
    }

    $('#search-button').on('click', doSearch);
    $('#search-form input').on('change input', function () {
        if (searchTimeout) {
            clearTimeout(searchTimeout);
            searchTimeout = null;
        }
        searchTimeout = setTimeout(doSearch, 200);
    });

    function doSearch() {
        var searchData = {},
            button = $('#search-button'),
            resetButton = function () {
                button.text('Search').removeAttr('disabled');
            },
            timeoutHandle;
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
    }

    function handleResults(data) {
        var tbody = $('#voter-table tbody').empty(),
            explanation = $('#explanation').empty(),
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

    $('#users-link').on('click', showUsers);

    function showUsers() {
        $.ajax({
            url: urlBase + 'users',
            dataType: 'json',
            success: function (users) {
                $('#top-row').hide();
                $('#bottom-row').html(userTableTemplate({users: users})).show()
                    .on('click', '.back-button', backToChecking);
            }
        });
        return false;
    }

    $('#bottom-row').on('click', '.save-user', function () {
        var $tr = $(this).closest('tr'),
            id = $tr.data('id'),
            url = urlBase + 'users',
            method = 'POST',
            userData = {
                username: $('[name=username]', $tr).val(),
                password: $('[name=password]', $tr).val(),
                email: $('[name=email]', $tr).val(),
                admin: $('[name=admin]', $tr).prop('checked') ? 1 : 0
            };
        if (id) {
            url += '/' + id;
            method = 'PUT';
        }
        $.ajax({
            url: url,
            dataType: 'json',
            data: userData,
            type: method,
            success: function (data) {
                showUsers();
            }
        });
    }).on('click', '.user-create-row', function () {
        var passwordField = $('[name=password]', this),
            digits = _.range(10);
        if (!passwordField.val()) {
            passwordField.val(
                _.range(4).map(function () {
                    return digits[Math.floor(Math.random() * 10)].toString();
                }).join('')
            );
        }
    }).on('click', '.assign-send-button', function () {
        var modal = $('#assign-pages-modal'),
            username = $('.username', modal).text(),
            pages = $('[name=pages]', modal).val();
        $.ajax({
            url: urlBase + 'users/' + username + '/pages',
            data: JSON.stringify(stringToList(pages)),
            dataType: 'json',
            contentType: 'application/json',
            type: 'POST',
            success: function () {
                $('#assign-pages-modal').modal('hide');
                showUsers();
            }
        });
    }).on('click', '.assign-modal-button', function () {
        var username = $(this).closest('tr').find('td:first').text();
        $('#assign-pages-modal .username').text(username);
    });

    $('#totals-link').on('click', showTotals);

    function showTotals() {
        $.ajax({
            url: urlBase + 'totals',
            dataType: 'json',
            success: function (rawTotals) {
                var totals = {'Unprocessed': rawTotals['']},
                    processedLines = 0,
                    nonBlank;
                _.each(findingCodes, function (label, code) {
                    var count = rawTotals[code] || 0;
                    label += ' [' + code + ']';
                    totals[label] = count;
                    if (code !== '' && code !== 'S') {
                        processedLines += count;
                    }
                });
                totals['Total lines processed'] = processedLines;
                nonBlank = processedLines - (rawTotals['B'] || 0);
                totals['Nonblank lines processed'] = nonBlank;
                if (nonBlank) {
                    totals['Valid percentage'] = (100 * rawTotals['OK'] / nonBlank).toFixed(1) + '%';
                }
                $('#top-row').hide();
                $('#bottom-row').html(totalTableTemplate({totals: totals})).show()
                    .on('click', '.back-button', backToChecking);
            }
        });
        return false;
    }

    function stringToList(s) {
        var numbers = [],
            m, n, end;
        while (m = s.match(/^\s*([1-9]\d*)(?:\s*-\s*([1-9]\d*))?(?:,\s*|\s+|$)/)) {
            s = s.substr(m[0].length);
            n = +m[1];
            end = m[2] == null ? n : +m[2];
            if (n > end) {
                throw new Error('Invalid range "' + n + '-' + end + '"');
            }
            while (n <= end) {
                numbers.push(n);
                n++;
            }
        }
        if (s) {
            throw new Error('Invalid number list "' + s + '"');
        }
        return numbers.sort(sortNumber);
    }

    function sortNumber(a, b) {
        return a - b;
    }
});

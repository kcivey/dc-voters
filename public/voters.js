(function ($) {
    var findingCodes, circulatorStatuses, extraFields, party, ward, imageDpi;

    $.getJSON('/config.json', function (data) {
        findingCodes = data.findingCodes;
        circulatorStatuses = data.circulatorStatuses;
        extraFields = data.extraFields;
        party = data.party;
        ward = data.ward;
        imageDpi = data.imageDpi;
        $(init);
    });

    function init() {
        var templateCache = {},
            alertTemplate = getTemplate('alert'),
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
            urlRoot: function () { return apiUrl('line'); },
            setSaved: function () {
                this.saved = true;
            },
            setUnsaved: function () {
                this.saved = false;
            }
        });

        var LineView = Backbone.View.extend({
            template: getTemplate('line-form'),
            initialize: function () {
                this.modelBinder = new Backbone.ModelBinder();
                this.render();
            },
            events: {
                'click .save': 'save',
                'change #date_signed': 'checkDateSigned'
            },
            checkDateSigned: checkDateSigned,
            render: function () {
                this.$el.html(this.template({findingCodes: findingCodes, extraFields: extraFields}));
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
                                }, 1000);
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

        var Circulator = Backbone.Model.extend({
            urlRoot: function () { return apiUrl('circulators'); }
        });

        var CirculatorView = Backbone.View.extend({
            template: getTemplate('circulator-form'),
            tableName: 'circulators',
            initialize: function () {
                this.modelBinder = new Backbone.ModelBinder();
                this.render();
            },
            events: {
                'click .save': 'save'
            },
            render: function () {
                this.$el.html(this.template({circulatorStatuses: circulatorStatuses}));
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
                    isNew = !that.model.get('id'),
                    jqXhr;
                if (!error && (jqXhr = this.model.save())) {
                    jqXhr
                        .done(function (data) {
                            var message = 'Record saved',
                                alert = that.showAlert(true, message),
                                timeoutHandle = setTimeout(function () {
                                    alert.alert('close');
                                }, 1000);
                            alert.on('closed', function () {
                                clearTimeout(timeoutHandle);
                                alert.closest('.modal').modal('hide');
                            });
                            if (that.tableName == 'pages' && isNew) {
                                // default to same values on next page
                                status.defaultPage = _.pick(data, 'number', 'circulator_id', 'date_signed');
                                status.defaultPage.number++;
                            }
                            showTable(that.tableName);
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
                var circulator = this.model;
                return null;
            }
        });

        var Page = Backbone.Model.extend({
            idAttribute: 'number',
            urlRoot: function () { return apiUrl('pages'); }
        });

        var PageView = CirculatorView.extend({
            template: getTemplate('page-form'),
            tableName: 'pages',
            events: {
                'click .save': 'save',
                'change [name=date_signed]': 'checkDateSigned'
            },
            checkDateSigned: checkDateSigned,
            render: function () {
                $.getJSON(apiUrl('circulators')).then(function (circulators) {
                    this.$el.html(this.template({circulators: circulators}));
                    if (this.model.get('id')) {
                        this.$('[name=number]').prop('readonly', true) // to prevent changing page number
                            .removeClass('form-control')
                            .addClass('form-control-plaintext');
                    }
                    this.modelBinder.bind(this.model, this.el);
                }.bind(this));
                return this;
            }
        });

        var User = Backbone.Model.extend({
            urlRoot: function () { return apiUrl('users'); }
        });

        var UserView = CirculatorView.extend({
            template: getTemplate('user-form'),
            tableName: 'users',
            events: {
                'click .save': 'save'
            },
            render: function () {
                this.$el.html(this.template());
                this.modelBinder.bind(this.model, this.el);
                return this;
            }
        });

        function checkDateSigned() {
            // This is a mess. Need proper date functions.
            var input = this.$('[name=date_signed]'),
                value = input.val(),
                currentYear = (new Date()).getFullYear(),
                parts, dd, mm, yy;
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
        }

        function makeName(v, reversed) {
            var name = v.firstname;
            if (v.middle) {
                name += ' ' + v.middle;
            }
            if (reversed) {
                name = v.lastname + ', ' + name;
            }
            else {
                name += ' ' + v.lastname;
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
                url: apiUrl('status'),
                dataType: 'json',
                cache: false
            }).then(
                function (data) {
                    // If we're still on the same page, keep the date signed
                    if (status.lineRecord && data.lineRecord && status.lineRecord.page == data.lineRecord.page) {
                        data.defaultDateSigned = status.defaultDateSigned;
                    }
                    if (status.defaultPage) {
                        data.defaultPage = status.defaultPage;
                    }
                    // Reload page if version has changed
                    if (status.version && status.version != data.version) {
                        window.location.reload();
                    }
                    status = data;
                    $('.navbar-brand').text(status.project.name);
                    $('title').text(status.project.name);
                    $('.version').text('v' + status.version);
                    callback(null, status); // null for no error
                },
                function (jqXhr, textStatus, errorThrown) {
                    if (errorThrown == 'Unauthorized') {
                        callback(null, {});
                    }
                    else {
                        callback('Unexpected problem: ' + textStatus + ' (' + errorThrown + ')');
                    }
                }
            );
        }

        function apiUrl(path) {
            var project = status.project;
            return '/api/' + (project ? project.code + '/' : '') + path;
        }

        function addProjectCode(url) {
            var project = status.project;
            return project ? url.replace(/^(\/(:api\/)?)/, function (match, p1) { return p1 + project.code + '/'; }) : url;
        }

        function start() {
            getStatus(function (err, status) {
                if (err) {
                    alert(err);
                }
                if (!status.user) {
                    $('#top-nav,#main-container').hide();
                    $('#send-token-card').show();
                }
                else {
                    $('#top-nav,#main-container').show();
                    $('#send-token-card').hide();
                    if (!status.user.admin) {
                        $('.admin-only').remove();
                    }
                    setStatus(status);
                }
            });
        }

        function commify(n) {
            return n.toString().replace(/(\d)(?=\d{3}$)/, '$1,');
        }

        function setStatus(status) {
            var statusDiv = $('#status'),
                checkFormTemplate = getTemplate('check-form'),
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
                showImageRow(rec.page, rec.line);
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
                hideImageRow();
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

        $('#top-nav').on('click', '.project-link', function (evt) {
            evt.preventDefault();
            window.open(addProjectCode($(this).attr('href')));
        });

        $('#main-container').on('click', '.user-edit-button', editUser);
        function editUser() {
            var id = $(this).data('id');
            if (id) {
                $.ajax({
                    url: apiUrl('users' + '/' + id),
                    dataType: 'json'
                }).then(showForm);
            }
            else {
                showForm();
            }
            function showForm(data) {
                var view = new UserView({model: new User(data)});
                openModal('User', view.$el);
            }
        }

        $('#main-container').on('click', '.send-token-button', sendToken);
        function sendToken() {
            var button = $(this),
                email = button.data('email');
            $.ajax({
                url: '/send-token',
                data: {user: email},
                dataType: 'json',
                type: 'post'
            }).then(
                function (data, textStatus, jqXhr) {
                    button.text('Sent').addClass('btn-success');
                    setTimeout(restoreButton, 500);
                },
                function (jqXhr, textStatus, errorThrown) {
                    button.text('Error').addClass('btn-danger');
                    setTimeout(restoreButton, 500);
                }
            );
            function restoreButton() {
                button.text('Send Link').removeClass('btn-success btn-danger');
            }
        }

        $('#main-container').on('click', '.circulator-edit-button', editCirculator);
        function editCirculator() {
            var id = $(this).data('id');
            if (id) {
                $.ajax({
                    url: apiUrl('circulators' + '/' + id),
                    dataType: 'json'
                }).then(showForm);
            }
            else {
                showForm();
            }
            function showForm(data) {
                var view = new CirculatorView({model: new Circulator(data)});
                openModal('Circulator', view.$el);
            }
        }

        $('#main-container').on('click', '.circulator-delete-button', function () {
            var id = $(this).data('id');
            if (id) {
                $.ajax({
                    url: apiUrl('circulators' + '/' + id),
                    dataType: 'json',
                    type: 'DELETE'
                }).then(function () {
                    showTable('circulators');
                });
            }
        });

        $('#main-container').on('click', '.circulator-totals-button', function () {
            var id = $(this).data('id'),
                name = $(this).data('name');
            showTotals(id, name);
        });

        $('#main-container').on('click', '.page-edit-button', editPage);
        function editPage() {
            var number = $(this).data('number');
            if (number) {
                $.ajax({
                    url: apiUrl('pages' + '/' + number),
                    dataType: 'json'
                }).then(showForm);
            }
            else {
                showForm(status.defaultPage);
            }
            function showForm(data) {
                var view = new PageView({model: new Page(data)});
                openModal('Page', view.$el);
            }
        }

        $('#send-token-form').on('submit', function (evt) {
            var email = $('#send-token-email').val();
            evt.preventDefault();
            if (email) {
                $.ajax({
                    url: '/send-token',
                    data: {user: email},
                    dataType: 'json',
                    type: 'post'
                }).then(
                    function (data, textStatus, jqXhr) {
                        showAlert(true, 'Check your email for a login link.');
                        start();
                    },
                    function (jqXhr, textStatus, errorThrown) {
                        showAlert(false, 'Problem sending link. Is this email address registered?');
                    }
                );
            }

            function showAlert(successful, text) {
                var form = $('#send-token-form'),
                    alert = $(alertTemplate({successful: successful, text: text || ''}));
                // remove any earlier alerts
                while (form.next().hasClass('alert')) {
                    form.next().remove();
                }
                alert.insertAfter(form);
            }
        });
        $('#voter-table')
            .on('click', '.match', function () {
                var voterData = $(this).closest('tr').data('voterData'),
                    formData = {
                        voter_id: voterData.voter_id,
                        voter_name: makeName(voterData),
                        address: makeAddress(voterData),
                        ward: voterData.ward
                    };
                if (party && voterData.party !== party) {
                    formData.finding = 'WP';
                    formData.notes = voterData.party;
                }
                else if (ward && voterData.ward !== ward) {
                    formData.finding = 'WW';
                    formData.notes = 'Ward ' + voterData.ward;
                }
                editLine(formData);
            })
            .on('click', '.not-found', function () {
                editLine({finding: 'NR'});
            });

        $('#check-form')
            .on('click', '#check-button', function () {
                var rec = status.lineRecord || {};
                $('#check-form, #check-results, #line-form').hide();
                $('#check-form').next('.alert').remove(); // remove leftover alert if there
                $('#search-form').show();
                showImageRow(rec.page, rec.line);
                $('#reset-button').click(); // clear search form
                $('#name').focus();
            })
            .on('click', '#blank-button, #rest-blank-button', function () {
                var rest = this.id.match(/^rest/),
                    rec = status.lineRecord,
                    url = apiUrl('mark-blank/' + rec.page + '/' + rec.line);
                if (rest) {
                    url += '-' + 20;
                }
                $.ajax({
                    url: url,
                    type: 'post',
                    dataType: 'json'
                }).then(start);
            })
            .on('click', '#illegible-button', function () {
                editLine({finding: 'I'});
            })
            .on('click', '.edit-button', function () {
                var form = $('#check-form'),
                    page = +$('[name=page]', form).val(),
                    line = +$('[name=line]', form).val();
                $.ajax({
                    url: apiUrl('line/' + page + '/' + line),
                    cache: false,
                    dataType: 'json'
                }).then(
                    function (lineRecord) {
                        status.lineRecord = lineRecord;
                        setStatus(status);
                    },
                    function (jqXhr, textStatus, errorThrown) {
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
                );
            });

        $('#log-out').on('click', function (evt) {
            evt.preventDefault();
            user = null;
            $.ajax({
                url: '/logout',
                cache: false
            }).then(function () {
                location.href = '/';
            });
        });

        $('#review-links').on('click', 'a', function (evt) {
            evt.preventDefault();
            var linkText = $(this).text(),
                value = $(this).data('value'),
                lineTableTemplate = getTemplate('line-table'),
                dataTable, url;
            if (/^Back/.test(linkText)) {
                backToChecking();
                return;
            }
            $('#top-row').hide();
            hideImageRow();
            $('#bottom-row').show().html(lineTableTemplate({}));
            url = apiUrl('dt-line');
            if (!status.user.admin) {
                url += '/' + status.user.username;
            }
            if (value) {
                url += '?filterColumn=finding&filterValue=' + value;
            }
            dataTable = $('#line-table').dataTable({
                ajax: url,
                processing: true,
                serverSide: true,
                destroy: true,
                pageLength: 25,
                orderClasses: false,
                order: [], // no sorting by default
                deferRender: true,
                initComplete: function () { // @todo Fix this for Bootstrap 4
                    var button = $('<button type="button"/>')
                        .text('Back to Checking')
                        .addClass('btn btn-link')
                        .click(function () {
                            $('#go-back').click(); // kluge
                        });
                    $('.dt-top-left').html(button);
                },
                columns: [
                    {
                        defaultContent: '<button type="button" class="btn btn-outline-primary btn-sm edit-button" title="Edit"><i class="fas fa-edit"></i></button>',
                        title: '',
                        searchable: false,
                        orderable: false
                    },
                    {
                        data: 'page',
                        title: 'Page',
                        className: 'number',
                        orderData: [0, 1],
                        searchable: false,
                        orderable: false
                    },
                    {
                        data: 'line',
                        title: 'Line',
                        className: 'number',
                        orderData: [0, 1],
                        searchable: false,
                        orderable: false
                    },
                    {
                        data: 'checker',
                        title: 'Checker',
                        searchable: false,
                        orderable: false
                    },
                    {
                        data: 'check_time',
                        title: 'Check Time',
                        searchable: false,
                        orderable: false,
                        createdCell: function (cell, cellData) {
                            $(cell).wrapInner('<time datetime="' + cellData + 'Z"></time>')
                                .find('time').timeago();
                        }
                    },
                    {
                        data: 'finding',
                        title: 'Finding',
                        className: 'text-center',
                        searchable: false,
                        orderable: false
                    },
                    {
                        data: 'voter_name',
                        title: 'Name',
                        searchable: true,
                        orderable: false
                    },
                    {
                        data: 'address',
                        title: 'Address',
                        searchable: true,
                        orderable: false
                    },
                    {
                        data: 'ward',
                        className: 'text-right',
                        title: 'Ward',
                        searchable: true,
                        orderable: false
                    },
                    {
                        data: function (row) {
                            return row.date_signed ?
                                row.date_signed.replace(/^(\d{4})-(\d\d)-(\d\d).*/, '$2/$3') : '';
                        },
                        title: 'Date',
                        searchable: true,
                        orderable: false
                    },
                    {
                        data: 'notes',
                        title: 'Notes',
                        searchable: true,
                        orderable: false
                    }
                ]
            });
            $('#line-table').on('click', '.edit-button', function () {
                var row = $(this).closest('tr'),
                    lineData = dataTable.api().row(row[0]).data();
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

        $('#search-button,#more-button').on('click', doSearch);
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
                    button.text('Search').prop('disabled', false);
                },
                more = this.id && this.id == 'more-button',
                timeoutHandle;
            $.each(['q', 'name', 'address'], function (i, name) {
                var value = $.trim($('#search-form-' + name).val());
                if (value) {
                    searchData[name] = value;
                }
            });
            if ($.isEmptyObject(searchData)) {
                return; // don't search if no search terms
            }
            button.text('Please Wait').prop('disabled', true);
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
            if (more) {
                searchData.limit = 50;
            }
            $.ajax({
                url: apiUrl('search'),
                data: searchData,
                dataType: 'json'
            })
                .then(handleResults)
                .always(
                    function () {
                        clearTimeout(timeoutHandle);
                        resetButton();
                    }
                );
        }

        function handleResults(data) {
            var tbody = $('#voter-table tbody').empty(),
                explanation = $('#explanation').empty(),
                results = data.results,
                voterRowTemplate = getTemplate('voter-row');
            $('#result-div > *').hide();
            $('#party-column-head').toggle(!!party);
            $('#voter-table').show();
            $.each(results, function (i, v) {
                var tr;
                v.name = makeName(v, true); // reversed
                v.address = makeAddress(v);
                v.partyDisplay = v.party ? v.party.substr(0, 3) : '';
                v.wantedParty = party;
                v.wantedWard = ward;
                tr = $(voterRowTemplate(v)).data('voterData', v);
                tbody.append(tr);
            });
            if (!results.length) {
                tbody.append(
                    '<tr><td colspan="7"><i>No matching voter records found.</i></td></tr>'
                );
            }
            $('#voter-table tfoot').toggle(results.length == 10); // show "More" only if there are exactly 10 results
            explanation.append(data.explanation).show();
        }

        $('.table-link').on('click', showTable);

        function showTable(name) {
            if (!_.isString(name)) {
                name = $(this).data('name');
            }
            $.ajax({
                url: apiUrl(name),
                dataType: 'json'
            }).then(
                function (data) {
                    var template = getTemplate(name.replace(/s$/, '') + '-table'),
                        values = {
                            useCirculatorStatus: !!Object.keys(circulatorStatuses).length,
                            project: status.project
                        };
                    values[name] = data;
                    $('#top-row').hide();
                    hideImageRow();
                    $('#bottom-row').html(template(values)).show()
                        .on('click', '.back-button', backToChecking);
                }
            );
            return false;
        }

        $('#bottom-row').on('click', '.assign-send-button', function () {
            var modal = $('#assign-pages-modal'),
                username = $('.username', modal).text(),
                pageString = $('[name=pages]', modal).val(),
                pages = stringToList(pageString);
            if (pages.length) {
                $.ajax({
                    url: apiUrl('users/' + username + '/pages'),
                    data: JSON.stringify(pages),
                    dataType: 'json',
                    contentType: 'application/json',
                    type: 'POST'
                }).then(
                    function () {
                        $('#assign-pages-modal').modal('hide');
                        showTable('users');
                    }
                );
            }
        }).on('click', '.assign-modal-button', function () {
            var username = $(this).closest('tr').find('td:first').text();
            $('#assign-pages-modal .username').text(username);
        });

        $('#totals-link').on('click', function () { showTotals(); });

        function showTotals(circulatorId, circulatorName) {
            var totalTableTemplate = getTemplate('total-table'),
                ajaxParams = {
                    url: apiUrl('totals'),
                    dataType: 'json'
                };
            if (circulatorId) {
                ajaxParams.data = {circulator: circulatorId};
            }
            $.ajax(ajaxParams).then(
                function (data) {
                    var rawTotals = data.totals,
                        totals = {'Unprocessed': rawTotals[''] || 0},
                        processedLines = 0,
                        seen = {},
                        nonBlank;
                    _.each(circulatorStatuses, function (label, code) {
                        var count = rawTotals[code] || 0;
                        label += ' [' + code + ']';
                        totals[label] = count;
                        seen[code] = true;
                    });
                    _.each(findingCodes, function (label, code) {
                        var count = rawTotals[code] || 0;
                        label += ' [' + code + ']';
                        totals[label] = count;
                        if (code !== '' && code !== 'S') {
                            processedLines += count;
                        }
                        seen[code] = true;
                    });
                    _.each(rawTotals, function (count, code) {
                        if (code !== '' && !seen[code]) {
                            totals[code] = count;
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
                    hideImageRow();
                    $('#bottom-row')
                        .html(totalTableTemplate({
                            totals: totals,
                            wardBreakdown: data.wardBreakdown,
                            circulatorName: circulatorName
                        }))
                        .show()
                        .on('click', '.back-button', backToChecking);
                }
            );
            return false;
        }

        function getTemplate(name) {
            if (!templateCache[name]) {
                templateCache[name] = _.template($('#' + name + '-template').html());
            }
            return templateCache[name];
        }

        function openModal(title, body) {
            var $modal = $('#global-modal');
            $('.modal-title', $modal).text(title);
            $('.modal-body', $modal).html(body);
            $modal.modal();
        }

        function hideImageRow() {
            showImageRow(null);
        }

        function showImageRow(page, line) {
            var $imageRow = $('#image-row'),
                $imageDiv = $('#image-div'),
                imageUrl = '/page-images/',
                divWidth, ratio, top;
            if (!page || !imageDpi) {
                $imageRow.slideUp();
                return;
            }
            page = page.toString();
            if (page.length < 4) {
                page = '0000'.substr(0, 4 - page.length) + page;
            }
            imageUrl += page + (+line <= 10 ? 'a' : 'b') + '.jpeg';
            $imageRow.slideDown();
            divWidth = $imageDiv.innerWidth();
            ratio = divWidth / (8.5 * imageDpi);
            top = -((line <= 10 ? 902 : -956) + 104 * line) * ratio;
            $imageDiv.css({height: (120 * ratio) + 'px'})
                .html(
                    $('<a/>').attr({href: imageUrl, target: '_blank'})
                        .html(
                            $('<img/>').attr('src', imageUrl).css({
                                position: 'absolute',
                                width: divWidth + 'px',
                                height: (divWidth * 11 / 8.5) + 'px',
                                top: top + 'px'
                            }).draggable({axis: 'y'})
                        )
                ).resizable({handles: 's'})
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
    }
})(jQuery);

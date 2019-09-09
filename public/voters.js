/* global Backbone _ jQuery */
/* eslint-disable no-restricted-properties */
(function ($) {

    $.getJSON('/config.json', init);

    function init(config) {
        const templateCache = {};
        const alertTemplate = getTemplate('alert');
        let status = {};
        let lineView;
        let searchTimeout;

        const Line = Backbone.Model.extend({
            initialize() {
                const line = this; // save to use in inner function
                this.saved = !this.isNew();
                this.on('change', this.setUnsaved, this);
                this.on('sync', this.setSaved, this);
                window.onbeforeunload = () => (line.saved ? null : 'The form has not been submitted.');
            },
            urlRoot: () => apiUrl('line'),
            setSaved() {
                this.saved = true;
            },
            setUnsaved() {
                this.saved = false;
            },
        });

        const LineView = Backbone.View.extend({
            template: getTemplate('line-form'),
            initialize() {
                this.modelBinder = new Backbone.ModelBinder();
                this.render();
            },
            events: {
                'click .save': 'save',
                'change #date_signed': 'checkDateSigned',
            },
            checkDateSigned,
            render() {
                this.$el.html(this.template(config));
                this.modelBinder.bind(this.model, this.el);
                return this;
            },
            showAlert(successful, text = '') {
                const alert = $(alertTemplate({successful, text}));
                // remove any earlier alerts
                while (this.$el.prev().hasClass('alert')) {
                    this.$el.prev().remove();
                }
                return alert.insertBefore(this.$el);
            },
            save() {
                const error = this.check();
                const that = this; // save to use in inner functions
                let jqXhr;
                if (!error && (jqXhr = this.model.save())) {
                    jqXhr
                        .done(function (data) {
                            const message = `Record saved for page ${data.page}, line ${data.line}`;
                            const alert = that.showAlert(true, message);
                            const timeoutHandle = setTimeout(() => alert.alert('close'), 1000);
                            alert.on('closed', () => clearTimeout(timeoutHandle));
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
            check() {
                return this.model.get('finding') ? null : 'Missing finding';
            },
        });

        const Circulator = Backbone.Model.extend({
            urlRoot: () => apiUrl('circulators'),
        });

        const CirculatorView = Backbone.View.extend({
            template: getTemplate('circulator-form'),
            tableName: 'circulators',
            initialize() {
                this.modelBinder = new Backbone.ModelBinder();
                this.render();
            },
            events: {
                'click .save': 'save',
            },
            render() {
                this.$el.html(this.template({circulatorStatuses: config.circulatorStatuses}));
                this.modelBinder.bind(this.model, this.el);
                return this;
            },
            showAlert(successful, text = '') {
                const alert = $(alertTemplate({successful, text}));
                // remove any earlier alerts
                while (this.$el.prev().hasClass('alert')) {
                    this.$el.prev().remove();
                }
                return alert.insertBefore(this.$el);
            },
            save() {
                const error = this.check();
                const that = this; // save to use in inner functions
                const isNew = !that.model.get('id');
                let jqXhr;
                if (!error && (jqXhr = this.model.save())) {
                    jqXhr
                        .done(function (data) {
                            const message = 'Record saved';
                            const alert = that.showAlert(true, message);
                            const timeoutHandle = setTimeout(() => alert.alert('close'), 1000);
                            alert.on('closed', function () {
                                clearTimeout(timeoutHandle);
                                alert.closest('.modal').modal('hide');
                            });
                            if (that.tableName === 'pages' && isNew) {
                                // default to same values on next page
                                status.defaultPage = {
                                    number: data.number,
                                    circulator_id: data.circulator_id,
                                    date_signed: data.date_signed,
                                };
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
            check() {
                // @todo Add some checks
                // const circulator = this.model;
                return null;
            },
        });

        const Page = Backbone.Model.extend({
            idAttribute: 'number',
            urlRoot: () => apiUrl('pages'),
        });

        const PageView = CirculatorView.extend({
            template: getTemplate('page-form'),
            tableName: 'pages',
            events: {
                'click .save': 'save',
                'change [name=date_signed]': 'checkDateSigned',
            },
            checkDateSigned,
            render() {
                $.getJSON(apiUrl('circulators')).then(function (circulators) {
                    this.$el.html(this.template({circulators}));
                    if (this.model.get('id')) {
                        this.$('[name=number]').prop('readonly', true) // to prevent changing page number
                            .removeClass('form-control')
                            .addClass('form-control-plaintext');
                    }
                    this.modelBinder.bind(this.model, this.el);
                }.bind(this));
                return this;
            },
        });

        const User = Backbone.Model.extend({
            urlRoot: () => apiUrl('users'),
        });

        const UserView = CirculatorView.extend({
            template: getTemplate('user-form'),
            tableName: 'users',
            events: {
                'click .save': 'save',
            },
            render() {
                this.$el.html(this.template());
                this.modelBinder.bind(this.model, this.el);
                return this;
            },
        });

        function checkDateSigned() {
            // This is a mess. Need proper date functions.
            const input = this.$('[name=date_signed]');
            const value = input.val();
            if (!value) {
                return;
            }
            const currentYear = new Date().getFullYear();
            const parts = value.match(/\d+/g);
            if (parts) {
                let mm = +parts[0];
                let dd = +parts[1];
                let yy = +(parts[2] || currentYear);
                if (yy < 100) {
                    yy += 2000;
                }
                if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12 && yy === currentYear) {
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
            let name = v.firstname;
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
            let address = v.res_house + v.res_frac + ' ' + v.res_street;
            if (v.res_apt) {
                address += ' #' + v.res_apt;
            }
            return address;
        }

        function getStatus(callback) {
            $.ajax({
                url: apiUrl('status'),
                dataType: 'json',
                cache: false,
            }).then(
                function (data) {
                    // If we're still on the same page, keep the date signed
                    if (status.lineRecord && data.lineRecord && status.lineRecord.page === data.lineRecord.page) {
                        data.defaultDateSigned = status.defaultDateSigned;
                    }
                    if (status.defaultPage) {
                        data.defaultPage = status.defaultPage;
                    }
                    // Reload page if version has changed
                    if (status.version && status.version !== data.version) {
                        window.location.reload();
                    }
                    status = data;
                    $('.navbar-brand').text(status.project.name);
                    $('title').text(status.project.name);
                    $('.version').text('v' + status.version);
                    callback(null, status); // null for no error
                },
                function (jqXhr, textStatus, errorThrown) {
                    if (errorThrown === 'Unauthorized') {
                        return callback(null, {});
                    }
                    return callback('Unexpected problem: ' + textStatus + ' (' + errorThrown + ')');
                }
            );
        }

        function apiUrl(path) {
            const project = status.project;
            return '/api/' + (project ? project.code + '/' : '') + path;
        }

        function addProjectCode(url) {
            const project = status.project;
            return project ? url.replace(/^(\/(:api\/)?)/, (match, p1) => p1 + project.code + '/') : url;
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
            const statusDiv = $('#status');
            $('#username', statusDiv).text(status.user.username || '(anonymous)');
            $('.complete', statusDiv).text(commify(status.complete));
            const total = status.incomplete + status.complete;
            $('.total', statusDiv).text(commify(total));
            $('#complete-bar').width(total ? (100 * status.complete / total) + '%' : 0);
            const rec = status.lineRecord || {};
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
                const checkFormTemplate = getTemplate('check-form');
                $('#check-form')
                    .html(
                        checkFormTemplate({
                            page: rec.page,
                            line: rec.line,
                            complete: status.complete,
                            admin: status.user.admin,
                        })
                    )
                    .show();
                $('#result-div .alert').insertAfter($('#check-form'));
                $('#search-form, #result-div > *').hide();
                hideImageRow();
            }
        }

        start();

        function editLine(lineData) {
            const lineForm = $('#line-form');
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
            const id = $(this).data('id');
            if (id) {
                $.ajax({
                    url: apiUrl('users' + '/' + id),
                    dataType: 'json',
                }).then(showForm);
            }
            else {
                showForm();
            }
            function showForm(data) {
                const view = new UserView({model: new User(data)});
                openModal('User', view.$el);
            }
        }

        $('#main-container').on('click', '.send-token-button', sendToken);
        function sendToken() {
            const button = $(this);
            const email = button.data('email');
            $.ajax({
                url: '/send-token',
                data: {user: email},
                dataType: 'json',
                type: 'post',
            }).then(
                function () {
                    button.text('Sent').addClass('btn-success');
                    setTimeout(restoreButton, 500);
                },
                function () {
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
            const id = $(this).data('id');
            if (id) {
                $.ajax({
                    url: apiUrl('circulators' + '/' + id),
                    dataType: 'json',
                }).then(showForm);
            }
            else {
                showForm();
            }
            function showForm(data) {
                const view = new CirculatorView({model: new Circulator(data)});
                openModal('Circulator', view.$el);
            }
        }

        $('#main-container').on('click', '.circulator-delete-button', function () {
            const id = $(this).data('id');
            if (id) {
                $.ajax({
                    url: apiUrl('circulators' + '/' + id),
                    dataType: 'json',
                    type: 'DELETE',
                }).then(() => showTable('circulators'));
            }
        });

        $('#main-container').on('click', '.circulator-totals-button', function () {
            const id = $(this).data('id');
            const name = $(this).data('name');
            showTotals(id, name);
        });

        $('#main-container').on('click', '.page-edit-button', editPage);
        function editPage() {
            const number = $(this).data('number');
            if (number) {
                $.ajax({
                    url: apiUrl('pages' + '/' + number),
                    dataType: 'json',
                }).then(showForm);
            }
            else {
                showForm(status.defaultPage);
            }
            function showForm(data) {
                const view = new PageView({model: new Page(data)});
                openModal('Page', view.$el);
            }
        }

        $('#send-token-form').on('submit', function (evt) {
            const email = $('#send-token-email').val();
            evt.preventDefault();
            if (email) {
                $.ajax({
                    url: '/send-token',
                    data: {user: email},
                    dataType: 'json',
                    type: 'post',
                }).then(
                    function () {
                        showAlert(true, 'Check your email for a login link.');
                        start();
                    },
                    function () {
                        showAlert(false, 'Problem sending link. Is this email address registered?');
                    }
                );
            }

            function showAlert(successful, text = '') {
                const form = $('#send-token-form');
                // remove any earlier alerts
                while (form.next().hasClass('alert')) {
                    form.next().remove();
                }
                const alert = $(alertTemplate({successful, text}));
                alert.insertAfter(form);
            }
        });
        $('#voter-table')
            .on('click', '.match', function () {
                const voterData = $(this).closest('tr')
                    .data('voterData');
                const formData = {
                    voter_id: voterData.voter_id,
                    voter_name: makeName(voterData),
                    address: makeAddress(voterData),
                    ward: voterData.ward,
                };
                if (config.party && voterData.party !== config.party) {
                    formData.finding = 'WP';
                    formData.notes = voterData.party;
                }
                else if (config.ward && voterData.ward !== config.ward) {
                    formData.finding = 'WW';
                    formData.notes = 'Ward ' + voterData.ward;
                }
                editLine(formData);
            })
            .on('click', '.not-found', () => editLine({finding: 'NR'}));

        $('#check-form')
            .on('click', '#check-button', function () {
                $('#check-form, #check-results, #line-form').hide();
                $('#check-form').next('.alert')
                    .remove(); // remove leftover alert if there
                $('#search-form').show();
                const rec = status.lineRecord || {};
                showImageRow(rec.page, rec.line);
                $('#reset-button').click(); // clear search form
                $('#name').focus();
            })
            .on('click', '#blank-button, #rest-blank-button', function () {
                const rest = this.id.match(/^rest/);
                const rec = status.lineRecord;
                let url = apiUrl('mark-blank/' + rec.page + '/' + rec.line);
                if (rest) {
                    url += '-' + 20;
                }
                $.ajax({
                    url,
                    type: 'post',
                    dataType: 'json',
                }).then(start);
            })
            .on('click', '#illegible-button', function () {
                editLine({finding: 'I'});
            })
            .on('click', '.edit-button', function () {
                const form = $('#check-form');
                const page = +$('[name=page]', form).val();
                const line = +$('[name=line]', form).val();
                $.ajax({
                    url: apiUrl('line/' + page + '/' + line),
                    cache: false,
                    dataType: 'json',
                }).then(
                    function (lineRecord) {
                        status.lineRecord = lineRecord;
                        setStatus(status);
                    },
                    function (jqXhr, textStatus, errorThrown) {
                        const message = textStatus + ' (' + errorThrown + ')';
                        const alert = $(alertTemplate({successful: false, text: message}));
                        const timeoutHandle = setTimeout(() => alert.alert('close'), 2500);
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
            status.user = null;
            $.ajax({
                url: '/logout',
                cache: false,
            }).then(function () {
                location.href = '/';
            });
        });

        $('#review-links').on('click', 'a', function (evt) {
            evt.preventDefault();
            const linkText = $(this).text();
            if (/^Back/.test(linkText)) {
                backToChecking();
                return;
            }
            $('#top-row').hide();
            hideImageRow();
            const lineTableTemplate = getTemplate('line-table');
            $('#bottom-row').html(lineTableTemplate({}))
                .show();
            let url = apiUrl('dt-line');
            if (!status.user.admin) {
                url += '/' + status.user.username;
            }
            const value = $(this).data('value');
            if (value) {
                url += '?filterColumn=finding&filterValue=' + value;
            }
            const dataTable = $('#line-table').dataTable({
                ajax: url,
                processing: true,
                serverSide: true,
                destroy: true,
                pageLength: 25,
                orderClasses: false,
                order: [], // no sorting by default
                deferRender: true,
                initComplete() { // @todo Fix this for Bootstrap 4
                    const button = $('<button type="button"/>')
                        .text('Back to Checking')
                        .addClass('btn btn-link')
                        .click(function () {
                            $('#go-back').click(); // kluge
                        });
                    $('.dt-top-left').html(button);
                },
                columns: [
                    {
                        defaultContent: '<button type="button" class="btn btn-outline-primary btn-sm edit-button" ' +
                            'title="Edit"><i class="fas fa-edit"></i></button>',
                        title: '',
                        searchable: false,
                        orderable: false,
                    },
                    {
                        data: 'page',
                        title: 'Page',
                        className: 'number',
                        orderData: [0, 1],
                        searchable: false,
                        orderable: false,
                    },
                    {
                        data: 'line',
                        title: 'Line',
                        className: 'number',
                        orderData: [0, 1],
                        searchable: false,
                        orderable: false,
                    },
                    {
                        data: 'checker',
                        title: 'Checker',
                        searchable: false,
                        orderable: false,
                    },
                    {
                        data: 'check_time',
                        title: 'Check Time',
                        searchable: false,
                        orderable: false,
                        createdCell(cell, cellData) {
                            $(cell).wrapInner('<time datetime="' + cellData + 'Z"></time>')
                                .find('time')
                                .timeago();
                        },
                    },
                    {
                        data: 'finding',
                        title: 'Finding',
                        className: 'text-center',
                        searchable: false,
                        orderable: false,
                    },
                    {
                        data: 'voter_name',
                        title: 'Name',
                        searchable: true,
                        orderable: false,
                    },
                    {
                        data: 'address',
                        title: 'Address',
                        searchable: true,
                        orderable: false,
                    },
                    {
                        data: 'ward',
                        className: 'text-right',
                        title: 'Ward',
                        searchable: true,
                        orderable: false,
                    },
                    {
                        data(row) {
                            return row.date_signed
                                ? row.date_signed.replace(/^(\d{4})-(\d\d)-(\d\d).*/, '$2/$3')
                                : '';
                        },
                        title: 'Date',
                        searchable: true,
                        orderable: false,
                    },
                    {
                        data: 'notes',
                        title: 'Notes',
                        searchable: true,
                        orderable: false,
                    },
                ],
            });
            $('#line-table').on('click', '.edit-button', function () {
                const row = $(this).closest('tr');
                const lineData = dataTable.api().row(row[0])
                    .data();
                status.lineRecord = lineData;
                $('#top-row').show();
                $('#bottom-row').hide()
                    .empty();
                setStatus(status);
                editLine(lineData);
            });
        });

        function backToChecking() {
            $('#top-row').show();
            $('#bottom-row').hide()
                .empty();
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
            const searchData = {};
            $.each(['q', 'name', 'address'], function (i, name) {
                const value = $.trim($('#search-form-' + name).val());
                if (value) {
                    searchData[name] = value;
                }
            });
            if ($.isEmptyObject(searchData)) {
                return; // don't search if no search terms
            }
            const button = $('#search-button');
            button.text('Please Wait').prop('disabled', true);
            $('#result-div > *').hide();
            const resetButton = () => button.text('Search').prop('disabled', false);
            // Use a timeout because JSONP calls don't always raise error
            // events when there's a problem.
            const timeoutHandle = setTimeout(
                function () {
                    alert('Something unexpected went wrong with the search request. Trying again might work.');
                    resetButton();
                },
                10000
            );
            const more = this.id && this.id === 'more-button';
            if (more) {
                searchData.limit = 50;
            }
            $.ajax({
                url: apiUrl('search'),
                data: searchData,
                dataType: 'json',
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
            $('#result-div > *').hide();
            $('#party-column-head').toggle(!!config.party);
            $('#voter-table').show();
            const results = data.results;
            const voterRowTemplate = getTemplate('voter-row');
            const tbody = $('#voter-table tbody').empty();
            $.each(results, function (i, v) {
                v.name = makeName(v, true); // reversed
                v.address = makeAddress(v);
                v.partyDisplay = v.party ? v.party.substr(0, 3) : '';
                v.wantedParty = config.party;
                v.wantedWard = config.ward;
                const tr = $(voterRowTemplate(v)).data('voterData', v);
                tbody.append(tr);
            });
            if (!results.length) {
                tbody.append(
                    '<tr><td colspan="7"><i>No matching voter records found.</i></td></tr>'
                );
            }
            $('#voter-table tfoot').toggle(results.length === 10); // show "More" only if there are exactly 10 results
            const explanation = $('#explanation').empty();
            explanation.append(data.explanation).show();
        }

        $('.table-link').on('click', showTable);

        function showTable(name) {
            if (typeof name !== 'string') {
                name = $(this).data('name');
            }
            $.ajax({
                url: apiUrl(name),
                dataType: 'json',
            }).then(
                function (data) {
                    const values = {
                        useCirculatorStatus: !!Object.keys(config.circulatorStatuses).length,
                        project: status.project,
                    };
                    values[name] = data;
                    $('#top-row').hide();
                    hideImageRow();
                    const template = getTemplate(name.replace(/s$/, '') + '-table');
                    $('#bottom-row').html(template(values))
                        .show()
                        .on('click', '.back-button', backToChecking);
                }
            );
            return false;
        }

        $('#bottom-row')
            .on('click', '.assign-send-button', function () {
                const modal = $('#assign-pages-modal');
                const username = $('.username', modal).text();
                const pageString = $('[name=pages]', modal).val();
                const pages = stringToList(pageString);
                if (pages.length) {
                    $.ajax({
                        url: apiUrl('users/' + username + '/pages'),
                        data: JSON.stringify(pages),
                        dataType: 'json',
                        contentType: 'application/json',
                        type: 'POST',
                    }).then(
                        function () {
                            $('#assign-pages-modal').modal('hide');
                            showTable('users');
                        }
                    );
                }
            })
            .on('click', '.assign-modal-button', function () {
                const username = $(this).closest('tr')
                    .find('td:first')
                    .text();
                $('#assign-pages-modal .username').text(username);
            });

        $('#totals-link').on('click', () => showTotals());

        function showTotals(circulatorId, circulatorName) {
            const ajaxParams = {
                url: apiUrl('totals'),
                dataType: 'json',
            };
            if (circulatorId) {
                ajaxParams.data = {circulator: circulatorId};
            }
            $.ajax(ajaxParams).then(
                function (data) {
                    const rawTotals = data.totals;
                    const totals = {'Unprocessed': rawTotals[''] || 0};
                    const seen = {};
                    let processedLines = 0;
                    $.each(config.circulatorStatuses, function (code, label) {
                        const count = rawTotals[code] || 0;
                        label += ' [' + code + ']';
                        totals[label] = count;
                        seen[code] = true;
                    });
                    $.each(config.findingCodes, function (code, label) {
                        const count = rawTotals[code] || 0;
                        label += ' [' + code + ']';
                        totals[label] = count;
                        if (code !== '' && code !== 'S') {
                            processedLines += count;
                        }
                        seen[code] = true;
                    });
                    $.each(rawTotals, function (code, count) {
                        if (code !== '' && !seen[code]) {
                            totals[code] = count;
                            processedLines += count;
                        }
                    });
                    totals['Total lines processed'] = processedLines;
                    const nonBlank = processedLines - (rawTotals['B'] || 0);
                    totals['Nonblank lines processed'] = nonBlank;
                    if (nonBlank) {
                        totals['Valid percentage'] = (100 * rawTotals['OK'] / nonBlank).toFixed(1) + '%';
                    }
                    $('#top-row').hide();
                    hideImageRow();
                    const totalTableTemplate = getTemplate('total-table');
                    $('#bottom-row')
                        .html(totalTableTemplate({
                            totals,
                            wardBreakdown: data.wardBreakdown,
                            circulatorName,
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
            const $modal = $('#global-modal');
            $('.modal-title', $modal).text(title);
            $('.modal-body', $modal).html(body);
            $modal.modal();
        }

        function hideImageRow() {
            showImageRow(null);
        }

        function showImageRow(page, line) {
            const $imageRow = $('#image-row');
            const $imageDiv = $('#image-div');
            if (!page || !config.imageDpi) {
                $imageRow.slideUp();
                return;
            }
            page = page.toString();
            if (page.length < 4) {
                page = '0000'.substr(0, 4 - page.length) + page;
            }
            const imageUrl = '/page-images/' + page + (+line <= 10 ? 'a' : 'b') + '.jpeg';
            $imageRow.slideDown();
            const divWidth = $imageDiv.innerWidth();
            const ratio = divWidth / (8.5 * config.imageDpi);
            const top = -((line <= 10 ? 902 : -956) + 104 * line) * ratio;
            $imageDiv.css({height: (120 * ratio) + 'px'})
                .html(
                    $('<a/>').attr({href: imageUrl, target: '_blank'})
                        .html(
                            $('<img/>').attr('src', imageUrl)
                                .css({
                                    position: 'absolute',
                                    width: divWidth + 'px',
                                    height: (divWidth * 11 / 8.5) + 'px',
                                    top: top + 'px',
                                })
                                .draggable({axis: 'y'})
                        )
                )
                .resizable({handles: 's'});
        }

        function stringToList(s) {
            const numbers = [];
            let m;
            while ((m = s.match(/^\s*([1-9]\d*)(?:\s*-\s*([1-9]\d*))?(?:,\s*|\s+|$)/))) {
                s = s.substr(m[0].length);
                let n = +m[1];
                const end = m[2] == null ? n : +m[2];
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

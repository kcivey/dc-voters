/**
 * Copyright 2012-2024 Keith C. Ivey
 * keith@iveys.org
 * https://dcgeekery.com
 */
/* global Backbone _ jQuery */
/* eslint-disable no-restricted-properties */
(function ($) {

    $(document).ajaxError(function (evt, jqXhr) {
        if (jqXhr.readyState < 4) {
            alert('Network Error\nCheck your connection.');
        }
    });

    $.getJSON('/user', init);

    function init(user) {
        const templateCache = {};
        const alertTemplate = getTemplate('alert');
        const projects = user && user.projects;
        let status = {};
        let lineView;
        let searchTimeout;
        let searchCount = 0;
        let project;
        let imageAdjustment = 0;

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
                'submit': 'save',
                'change #date_signed': 'checkDateSigned',
            },
            checkDateSigned,
            render() {
                this.$el.html(this.template(project));
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
            save(evt) {
                evt.preventDefault();
                const error = this.check();
                const that = this; // save to use in inner functions
                let jqXhr;
                if (!error && (jqXhr = this.model.save())) {
                    jqXhr
                        .done(function (data) {
                            const message = `Record saved for page ${data.page}, line ${data.line}`;
                            const alert = that.showAlert(true, message);
                            const timeoutHandle = setTimeout(() => alert.alert('close'), 1000);
                            alert.on('closed.bs.alert', () => clearTimeout(timeoutHandle));
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

        setUpProjectMenu();
        setUpHandlers();
        start();

        function start() {
            if (!user || !projects.length) {
                $('#top-nav,#main-container').hide();
                $('#send-token-card').show();
                return;
            }
            if (!project) {
                const m = document.cookie.match(/(?:(?:^|.*;\s*)project\s*=\s*([^;]*).*$)|^.*$/);
                const projectCode = m[1];
                if (projectCode) {
                    project = projects.find(p => p.code === projectCode);
                }
                if (!project) {
                    project = projects[0];
                }
            }
            getStatus(function (err, status) {
                if (err) {
                    alert(err);
                }
                else {
                    $('#top-nav,#main-container,#check-form').show();
                    $('#check-form-name').val('')
                        .focus();
                    $('#check-form-address').val('');
                    $('#send-token-card').hide();
                    $('.admin-only').toggle(!!user.admin);
                    $('#challenge-link').toggle(project.type === 'challenge');
                    $('.response-link').toggle(project.type === 'response');
                    $('#invoices-link').toggle(project.paidCirculators);
                    setStatus(status);
                }
            });
        }

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
                    $('.navbar-brand').text(project.name);
                    $('title').text(project.name);
                    $('.version').text('v' + status.version);
                    callback(null, status); // null for no error
                },
                function (jqXhr, textStatus, errorThrown) {
                    if (errorThrown === 'Unauthorized') {
                        return callback(null, {});
                    }
                    return callback('Unexpected problem getting status: ' + textStatus + ' (' + errorThrown + ')');
                }
            );
        }

        function apiUrl(path) {
            return '/api/' + (project ? project.code + '/' : '') + path;
        }

        function formatPageNumber(internalPageNumber) {
            let pageNumber = internalPageNumber;
            // let i = 0;
            for (const b of project.batches || []) {
                if (pageNumber <= b) {
                    // const prefix = i === 0 ? '' : (project.batches.length < 3 ? 'S-' : 'S' + i + '-');
                    return internalPageNumber + ' (' + pageNumber + ' of ' + b + ')';
                }
                pageNumber -= b;
                // i++;
            }
            return internalPageNumber;
        }

        function setStatus(status) {
            const statusDiv = $('#status');
            $('#username', statusDiv).text(user.username || '(anonymous)');
            $('.complete', statusDiv).text(commify(status.complete));
            const total = status.incomplete + status.complete;
            $('.total', statusDiv).text(commify(total));
            $('#complete-bar').width(total ? (100 * status.complete / total) + '%' : 0);
            const rec = status.lineRecord || {};
            $('#challenge-reason-alert').hide();
            if (rec.line) {
                $('#page-line').html('Page ' + formatPageNumber(rec.page) + ', Line ' + rec.line)
                    .show();
                if (rec.challenged) {
                    $('#challenge-reason-alert').text(
                        rec.challenge_reason ? 'Challenge reason: ' + rec.challenge_reason : 'Challenged'
                    )
                        .show();
                }
                showImageRow(rec.page, rec.line);
            }
            else {
                $('#page-line').hide();
                hideImageRow();
            }
            if (rec.finding) {
                $('#check-form').show();
                $('#check-form-name').focus();
                editLine(rec);
                return;
            }
            $('.pages-left').toggle(!!rec.line);
            $('.no-pages-left').toggle(!rec.line);
            $('.pages-completed').toggle(!!status.complete);
            $('.no-pages-completed').toggle(!status.complete);
            $('#check-form').show()
                .after($('#result-div .alert'));
            $('#result-div > *').hide();

            function commify(n) {
                return n.toString().replace(/(\d)(?=\d{3}$)/, '$1,');
            }
        }

        function editLine(lineData) {
            $('div.tooltip').remove(); // remove leftover tooltips
            const lineForm = $('#line-form');
            if (searchTimeout) {
                clearTimeout(searchTimeout);
                searchTimeout = null;
            }
            lineData = $.extend(
                status.lineRecord,
                {checker: user.username},
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
            $('#voter_name').focus();
        }

        function showTable(name) {
            if (typeof name !== 'string') {
                name = $(this).data('name');
            }
            $('#top-row').hide();
            hideImageRow();
            if (name === 'pages') {
                return showPageTable();
            }
            $('#bottom-row').hide();
            return $.getJSON(apiUrl(name)).then(
                function (data) {
                    const values = {
                        useCirculatorStatus: !!Object.keys(project.circulatorStatuses).length,
                        project,
                        today: getToday(),
                    };
                    values[name] = data;
                    const template = getTemplate(name.replace(/s$/, '') + '-table');
                    const $table = $(template(values));
                    if (!data.length) {
                        const cols = $('tr', $table).eq(0)
                            .children().length;
                        $('tbody', $table).append(
                            `<tr><td colspan="${cols}" class="text-center"><em>No records</em></td></tr>`
                        );
                    }
                    $('#bottom-row').html($table)
                        .show()
                        .find('button[title], a[title]')
                        .tooltip();
                }
            );

            function getToday() {
                const date = new Date();
                const year = date.getFullYear();
                const month = (1 + date.getMonth()).toString()
                    .padStart(2, '0');
                const day = date.getDate().toString()
                    .padStart(2, '0');
                return month + '/' + day + '/' + year;
            }
        }

        function showPageTable() {
            const $table = $('#page-table');
            if ($table.length) {
                $('#bottom-row').show();
                $table.DataTable().ajax.reload(null, false); // eslint-disable-line new-cap
                return;
            }
            const template = getTemplate('page-table');
            $('#bottom-row').html(template({project, pages: []}))
                .show();
            const columns = [
                {
                    render(data, type, row) {
                        let html = '<div class="btn-group btn-group-sm">' +
                            '<button type="button" title="Edit" ' +
                            'class="btn btn-outline-primary table-button btn-sm page-edit-button">' +
                            '<i class="fas fa-pencil-alt fa-fw"></i></button>';
                        if (row.processed_lines) {
                            html += '<button type="button" title="Summary" ' +
                                'class="btn btn-outline-success table-button btn-sm page-view-button">' +
                                '<i class="fas fa-list-ol fa-fw"></i></button>';
                        }
                        html += '</div>';
                        return html;
                    },
                    title: '',
                },
                {
                    data: 'number',
                    title: 'Page',
                    className: 'number',
                },
                {
                    data: 'circulator_name',
                    title: 'Circulator',
                },
                {
                    data(row) {
                        return row.date_signed
                            ? row.date_signed.replace(/^(\d{4})-(\d\d)-(\d\d).*/, '$2/$3')
                            : '';
                    },
                    title: 'Date',
                },
                {
                    data: 'notes',
                    title: 'Notes',
                },
            ];
            if (project.type === 'response') {
                columns.push({
                    data: 'challenged_lines',
                    title: 'Challenged',
                    className: 'number',
                });
            }
            columns.push(
                {
                    data: 'processed_lines',
                    title: 'Processed',
                    className: 'number',
                },
                {
                    data: 'valid_lines',
                    title: 'Valid',
                    className: 'number',
                },
                {
                    data: 'checker',
                    title: 'Checker',
                }
            );
            if (project.paidCirculators) {
                columns.push({
                    data: 'date_paid',
                    title: 'Paid',
                });
            }
            for (const c of columns) {
                if (!c.searchable) {
                    c.searchable = false;
                }
                if (!c.orderable) {
                    c.orderable = false;
                }
            }
            const m = document.cookie.match(/(?:(?:^|.*;\s*)pageLength\s*=\s*([^;]*).*$)|^.*$/);
            const pageLength = (m && m[1]) || 250;
            $('#page-table').dataTable({
                ajax: apiUrl('pages/dt'),
                processing: true,
                serverSide: true,
                destroy: true,
                pageLength,
                lengthMenu: [50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000],
                orderClasses: false,
                order: [], // no sorting by default
                deferRender: true,
                dom: "<'row'<'col-sm-12 col-md-6'l><'col-sm-12 col-md-6'f><'col-sm-12'p>>" +
                    "<'row'<'col-sm-12'tr>>" +
                    "<'row'<'col-sm-12 col-md-5'i><'col-sm-12 col-md-7'p>>",
                initComplete() {
                    $('#page-table button[title]').tooltip();
                },
                columns,
            });
            $('#page-table_length select').on('change', function () {
                document.cookie = 'pageLength=' + $(this).val() + '; SameSite=Strict';
            });
            $('#page-table').on('page.dt', function () {
                $('#page-table').one('draw.dt', function () {
                    $('#page-table').css('width', 'auto')
                        .DataTable() // eslint-disable-line new-cap
                        .columns
                        .adjust();
                });
            });
        }

        function getTemplate(name) {
            if (!templateCache[name]) {
                templateCache[name] = _.template($('#' + name + '-template').html());
            }
            return templateCache[name];
        }

        function hideImageRow() {
            showImageRow(null);
        }

        function showImageRow(page, line) {
            const $imageRow = $('#image-row');
            const $imageDiv = $('#image-div');
            if (!page || !project.imageDpi) {
                $imageRow.slideUp();
                return;
            }
            const imageUrl = makeImageUrl(project, page, line);
            $imageRow.slideDown();
            const divWidth = $imageDiv.innerWidth();
            const ratio = divWidth / (8.5 * project.imageDpi);
            const top = getLineTop(project, line) * ratio + imageAdjustment;
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
                                .draggable({
                                    axis: 'y',
                                    stop: saveImageAdjustment,
                                })
                        )
                )
                .resizable({handles: 's'});

            function saveImageAdjustment(evt, ui) {
                imageAdjustment += ui.position.top - ui.originalPosition.top;
            }
        }

        function getLineTop(project, line) {
            if (project.linesPerPage > 10) { // 2-sided
                if (line <= 10) {
                    return -902 - 104 * line;
                }
                return -84 - 104 * (line - 10);
            }
            return -580 - 70 * line;
        }

        function makeImageUrl(project, page, line) {
            return '/' + project.code + '/page-images/' + page.toString().padStart(4, '0') +
                (project.linesPerPage > 10 ? (+line <= 10 ? 'a' : 'b') : '') + '.jpeg';
        }

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
                    $.each(project.circulatorStatuses, function (code, label) {
                        const count = rawTotals[code] || 0;
                        label += ' [' + code + ']';
                        totals[label] = count;
                        seen[code] = true;
                    });
                    $.each(project.findingCodes, function (code, label) {
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
                    if (data.avgTime) {
                        totals['Average lines per hour per person'] = Math.round(3600 / data.avgTime);
                    }
                    $('#top-row').hide();
                    hideImageRow();
                    const totalTableTemplate = getTemplate('total-table');
                    $('#bottom-row')
                        .html(totalTableTemplate({
                            totals,
                            wardBreakdown: data.wardBreakdown,
                            circulatorName,
                            commify,
                        }))
                        .show();
                }
            );

            function commify(n) {
                return n.toString().replace(/(\d)(?=(?:\d{3})+$)/g, '$1,');
            }
        }

        function makeName(v, reversed) {
            let name = v.firstname;
            if (v.middle && reversed) {
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
            let address = v.res_house;
            if (v.res_frac) {
                address += '-' + v.res_frac;
            }
            address += ' ' + v.res_street;
            if (v.res_apt) {
                address += ' #' + v.res_apt;
            }
            return address;
        }

        function sendToken(email) {
            return $.ajax({
                url: '/send-token',
                data: {user: email},
                dataType: 'json',
                type: 'POST',
            });
        }

        function setUpProjectMenu() {
            if (!projects || projects.length < 2) {
                return;
            }
            const template = getTemplate('project-menu');
            $('button.log-out').closest('.nav-item')
                .replaceWith(template({projects}));
        }

        function setUpHandlers() {
            $('.modal').on('shown.bs.modal', function (evt) {
                $('.modal-body input', evt.target).eq(0)
                    .focus();
            });
            $('.modal-dialog').draggable({handle: '.modal-header'});
            setUpNavHandlers();
            setUpTopRowHandlers();
            setUpBottomRowHandlers();
        }

        function setUpTopRowHandlers() {
            $('#voter-table')
                .on('click', '.match', handleMatch)
                .on('click', '.not-found', () => editLine({finding: 'NR'}));
            $('#send-token-form')
                .on('submit', sendTokenFromForm);
            $('#more-button').on('click', function () {
                $('#line-form').hide();
                $('#check-form').next('.alert')
                    .remove(); // remove leftover alert if there
                const rec = status.lineRecord || {};
                showImageRow(rec.page, rec.line);
                doSearch(true);
            });
            $('#check-form')
                .on('click', '#search-button', doSearch)
                .on('click', '#blank-button, #rest-blank-button', markBlankLines)
                .on('click', '#illegible-button', () => editLine({finding: 'I'}))
                .on('change input', 'input[type=text]', function () {
                    if (searchTimeout) {
                        clearTimeout(searchTimeout);
                        searchTimeout = null;
                    }
                    searchCount++;
                    searchTimeout = setTimeout(() => doSearch(false, searchCount), 200);
                });
            $('#check-instructions')
                .on('show.bs.collapse', () => $('#check-instructions-toggle').html('&times;'))
                .on(
                    'hide.bs.collapse',
                    () => $('#check-instructions-toggle').html('<i class="fas fa-question-circle"></i>')
                );

            function sendTokenFromForm(evt) {
                const form = $(this);
                const email = $('#send-token-email').val();
                evt.preventDefault();
                if (!email) {
                    return;
                }
                sendToken(email).then(
                    function () {
                        showAlert(true, 'Check your email for a login link.');
                        start();
                    },
                    function () {
                        showAlert(false, 'Problem sending link. Is this email address registered?');
                    }
                );

                function showAlert(successful, text = '') {
                    // remove any earlier alerts
                    while (form.next().hasClass('alert')) {
                        form.next().remove();
                    }
                    const alert = $(alertTemplate({successful, text}));
                    alert.insertAfter(form);
                }
            }

            function handleMatch() {
                const voterData = $(this).closest('tr')
                    .data('voterData');
                const formData = {
                    voter_id: voterData.voter_id,
                    voter_name: makeName(voterData),
                    address: makeAddress(voterData),
                    ward: voterData.ward,
                };
                if (project.party && voterData.party !== project.party) {
                    formData.finding = 'WP';
                    formData.notes = voterData.party;
                }
                else if (project.ward && voterData.ward !== project.ward) {
                    formData.finding = 'WW';
                    formData.notes = 'Ward ' + voterData.ward;
                }
                else if (voterData.duplicate_line) {
                    formData.finding = 'D';
                    formData.notes = `Duplicate of page ${voterData.duplicate_page}, line ${voterData.duplicate_line}`;
                }
                editLine(formData);
            }

            function markBlankLines() {
                const rest = this.id.match(/^rest/);
                const rec = status.lineRecord;
                let url = apiUrl('mark-blank/' + rec.page + '/' + rec.line);
                if (rest) {
                    url += '-' + project.linesPerPage;
                }
                $.ajax({
                    url,
                    type: 'POST',
                    dataType: 'json',
                }).then(start);
            }

            function doSearch(more, searchNumber) {
                const searchData = {};
                let searchLength = 0;
                $.each(['q', 'name', 'address'], function (i, name) {
                    const value = $.trim($('#check-form-' + name).val());
                    if (value) {
                        searchData[name] = value;
                        searchLength += value.length;
                    }
                });
                if (searchLength < 2) {
                    return; // don't search if no search terms or too short
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
                if (more) {
                    searchData.limit = 50;
                }
                $.getJSON(apiUrl('search'), searchData)
                    .then(handleResults)
                    .always(
                        function () {
                            clearTimeout(timeoutHandle);
                            resetButton();
                        }
                    );

                function handleResults(data) {
                    if (searchNumber && searchNumber < searchCount) {
                        return; // don't process late-returning results
                    }
                    $('#result-div > *').hide();
                    $('#party-column-head').toggle(!!project.party);
                    $('#voter-table').show();
                    const results = data.results;
                    const voterRowTemplate = getTemplate('voter-row');
                    const tbody = $('#voter-table tbody').empty();
                    $.each(results, function (i, v) {
                        v.name = makeName(v, true); // reversed
                        v.address = makeAddress(v);
                        v.partyDisplay = v.party ? v.party.slice(0, 3) : '';
                        v.wantedParty = project.party;
                        v.wantedWard = project.ward;
                        const tr = $(voterRowTemplate(v)).data('voterData', v);
                        tbody.append(tr);
                    });
                    if (!results.length) {
                        tbody.append(
                            '<tr><td colspan="7"><i>No matching voter records found.</i></td></tr>'
                        );
                    }
                    // show "More" only if there are exactly 10 results
                    $('#voter-table tfoot').toggle(results.length === 10);
                    const explanation = $('#explanation').empty();
                    explanation.append(data.explanation).show();
                }
            }
        }

        function setUpNavHandlers() {
            $('#top-nav')
                .on('click', '.project-link', function (evt) {
                    evt.preventDefault();
                    window.open(apiUrl($(this).attr('href')));
                })
                .on('click', '.table-link', showTable)
                .on('click', '.log-out', logout)
                .on('click', '.project-button', function () {
                    const projectCode = $(this).attr('value');
                    document.cookie = 'project=' + projectCode + '; SameSite=Strict';
                    project = projects.find(p => p.code === projectCode);
                    backToChecking();
                });

            $('#totals-link')
                .on('click', () => showTotals());
            $('#review-links').on('click', 'button', displayReviewTable);
            $('#edit-line-link').on('click', function () {
                const selector = $(this).data('target');
                $(selector).collapse('toggle');
                $('#edit-line-form-page').focus();
                return false;
            });
            $('#edit-line-form').on('submit', handleAdminLineEdit);

            function logout(evt) {
                evt.preventDefault();
                $.ajax({url: '/logout', cache: false})
                    .then(
                        function () {
                            user = null;
                            start();
                            window.location.href = '/';
                        },
                        function () {
                            alert("Can't log out. Probably a network error. Close your browser to log out.");
                        }
                    )
                    .then(
                        function () {
                            // Delete login cookie
                            document.cookie = 'connect.sid=;expires=Thu, 01 Jan 1970 00:00:00 GMT;SameSite=Strict';
                            document.cookie = 'project=;expires=Thu, 01 Jan 1970 00:00:00 GMT;SameSite=Strict';
                        }
                    );
            }

            function displayReviewTable(evt) {
                evt.preventDefault();
                $('#top-row').hide();
                hideImageRow();
                const lineTableTemplate = getTemplate('line-table');
                $('#bottom-row').html(lineTableTemplate({}))
                    .show();
                let url = apiUrl('dt-line');
                if (!user.admin || !$(this).hasClass('admin-only')) {
                    url += '/' + user.username;
                }
                const value = $(this).data('value');
                if (value) {
                    url += '?filterColumn=finding&filterValue=' + value;
                }
                const columns = [
                    {
                        defaultContent: '<button type="button" class="btn btn-outline-primary btn-sm edit-button ' +
                            'table-button" title="Edit"><i class="fas fa-pencil-alt fa-fw"></i></button>',
                        title: '',
                        width: 33,
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
                        width: 60,
                        searchable: false,
                        orderable: false,
                    },
                    {
                        data: 'check_time',
                        title: 'Check Time',
                        width: 164,
                        className: 'text-nowrap',
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
                        width: 30,
                        searchable: false,
                        orderable: false,
                    },
                    {
                        data: 'voter_name',
                        title: 'Name',
                        className: 'text-nowrap',
                        searchable: true,
                        orderable: false,
                    },
                    {
                        data: 'address',
                        title: 'Address',
                        className: 'text-nowrap',
                        searchable: true,
                        orderable: false,
                    },
                    {
                        data: 'ward',
                        className: 'text-right',
                        title: 'Ward',
                        width: 30,
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
                        width: 60,
                        searchable: true,
                        orderable: false,
                    },
                ];
                if (project.type === 'response') {
                    columns.push(
                        {
                            data: 'challenge_reason',
                            title: 'Challenge Reason',
                            searchable: true,
                            orderable: false,
                        },
                        {
                            data: 'rebuttal',
                            title: 'Rebuttal',
                            searchable: true,
                            orderable: false,
                        }
                    );
                }
                columns.push(
                    {
                        data: 'circulator_name',
                        title: 'Circulator',
                        searchable: false,
                        orderable: false,
                    },
                    {
                        data: 'notes',
                        title: 'Notes',
                        searchable: true,
                        orderable: false,
                    }
                );
                const dataTable = $('#line-table').dataTable({
                    ajax: url,
                    processing: true,
                    serverSide: true,
                    destroy: true,
                    pageLength: 25,
                    orderClasses: false,
                    order: [], // no sorting by default
                    deferRender: true,
                    dom: "<'row'<'col-sm-12 col-md-6'l><'col-sm-12 col-md-6'f><'col-sm-12'p>>" +
                        "<'row'<'col-sm-12'tr>>" +
                        "<'row'<'col-sm-12 col-md-5'i><'col-sm-12 col-md-7'p>>",
                    initComplete() { // @todo Fix this for Bootstrap 4
                        const button = $('<button type="button"/>')
                            .text('Back to Checking')
                            .addClass('btn btn-link')
                            .click(function () {
                                $('#go-back').click(); // kluge
                            });
                        $('#line-table button[title]').tooltip();
                        $('.dt-top-left').html(button);
                    },
                    columns,
                });
                $('#line-table').on('click', '.edit-button', function () {
                    const row = $(this).closest('tr');
                    const lineData = dataTable.api().row(row[0])
                        .data();
                    delete lineData.circulator_name; // added only for display
                    status.lineRecord = lineData;
                    $('#top-row').show();
                    $('#bottom-row').hide()
                        .empty();
                    setStatus(status);
                    editLine(lineData);
                });
            }

            function handleAdminLineEdit(evt) {
                evt.preventDefault();
                const form = $(this);
                const page = +$('[name=page]', form).val();
                const line = +$('[name=line]', form).val();
                $.ajax({
                    url: apiUrl('line/' + page + '/' + line),
                    cache: false,
                    dataType: 'json',
                }).then(
                    function (lineRecord) {
                        status.lineRecord = lineRecord;
                        $('#edit-line-form').collapse('hide');
                        $('#admin-dropdown').dropdown('hide');
                        $('#top-row').show();
                        $('#bottom-row').hide()
                            .empty();
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
                            .on('closed.bs.alert', () => clearTimeout(timeoutHandle));
                    }
                );
            }
        }

        function setUpBottomRowHandlers() {
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
                    'submit': 'save',
                },
                render() {
                    this.$el.html(this.template({
                        circulatorStatuses: project.circulatorStatuses,
                        paidCirculators: project.paidCirculators,
                    }));
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
                save(evt) {
                    evt.preventDefault();
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
                                alert.on('closed.bs.alert', function () {
                                    clearTimeout(timeoutHandle);
                                    that.$el.closest('.modal').modal('hide');
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
                    'submit': 'save',
                    'change [name=date_signed]': 'checkDateSigned',
                },
                checkDateSigned,
                render() {
                    $.getJSON(apiUrl('circulators')).then(
                        function (circulators) {
                            $.getJSON(apiUrl('users/usernames')).then(
                                function (checkers) {
                                    this.$el.html(this.template({circulators, checkers}));
                                    if (this.model.get('id')) {
                                        this.$('[name=number]').prop('readonly', true)
                                            .removeClass('form-control')
                                            .addClass('form-control-plaintext');
                                    }
                                    this.modelBinder.bind(this.model, this.el);
                                }.bind(this)
                            );
                        }.bind(this)
                    );
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
                    'submit': 'save',
                },
                render() {
                    this.$el.html(this.template());
                    this.modelBinder.bind(this.model, this.el);
                    return this;
                },
            });

            $('#bottom-row')
                .on('click', '.assign-modal-button', setUpAssignModal)
                .on('click', '.back-button', backToChecking)
                .on('click', '.send-token-button', sendTokenFromUserTable)
                .on('click', '.user-edit-button', editUser)
                .on('click', '#create-invoices-button', createInvoices)
                .on('click', '.circulator-edit-button', editCirculator)
                .on('click', '.circulator-delete-button', deleteCirculator)
                .on('click', '.circulator-totals-button', showCirculatorTotals)
                .on('click', '.page-edit-button', editPage)
                .on('click', '.page-upload-show-button', showPageUploadForm)
                .on('click', '.page-view-button', displayPage);

            $('#global-modal').on('click', '.circulator-edit-button', editCirculator);

            $('#assign-pages-modal')
                .on('click', '.assign-send-button', assignPages);

            function assignPages() {
                const modal = $('#assign-pages-modal');
                const username = $('.username', modal).text()
                    .trim();
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

                function stringToList(s) {
                    const numbers = [];
                    let m;
                    while ((m = s.match(/^\s*([1-9]\d*)(?:\s*-\s*([1-9]\d*))?(?:,\s*|\s+|$)/))) {
                        s = s.slice(m[0].length);
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
                    return numbers.sort((a, b) => a - b);
                }
            }

            function setUpAssignModal() {
                const username = $(this).closest('tr')
                    .find('td')
                    .eq(1)
                    .text();
                $('#assign-pages-modal [name=pages]').val('');
                $('#assign-pages-modal .username').text(username);
            }

            function showCirculatorTotals() {
                const id = $(this).data('id');
                const name = $(this).data('name');
                showTotals(id, name);
            }

            function sendTokenFromUserTable() {
                const button = $(this);
                const email = button.data('email');
                const originalButtonContent = button.html();
                sendToken(email).then(
                    function () {
                        button.text('Sent').addClass('btn-success');
                        setTimeout(restoreButton, 1000);
                    },
                    function () {
                        button.text('Error').addClass('btn-danger');
                        setTimeout(restoreButton, 1000);
                    }
                );
                function restoreButton() {
                    button.html(originalButtonContent)
                        .removeClass('btn-success btn-danger');
                }
            }

            function editUser() {
                const id = $(this).data('id');
                if (id) {
                    $.getJSON(apiUrl('users' + '/' + id)).then(showForm);
                }
                else {
                    showForm();
                }
                function showForm(data) {
                    const view = new UserView({model: new User(data)});
                    openModal('User', view.$el);
                }
            }

            function editCirculator() {
                const id = $(this).data('id');
                if (id) {
                    $.getJSON(apiUrl('circulators' + '/' + id)).then(showForm);
                }
                else {
                    showForm();
                }
                function showForm(data) {
                    const view = new CirculatorView({model: new Circulator(data)});
                    openModal('Circulator', view.$el);
                }
            }

            function createInvoices() {
                const date = $('#invoice-through-date').val()
                    .replace(/^(\d\d)\/(\d\d)\/(\d{4})$/, '$3-$1-$2');
                $.ajax({
                    url: apiUrl('invoices/create' + '/' + date),
                    dataType: 'json',
                    type: 'POST',
                }).then(() => showTable('invoices'));
            }

            function deleteCirculator() {
                const id = $(this).data('id');
                if (id) {
                    $.ajax({
                        url: apiUrl('circulators' + '/' + id),
                        dataType: 'json',
                        type: 'DELETE',
                    }).then(() => showTable('circulators'));
                }
            }

            function editPage() {
                const number = $(this).data('number') ||
                    $(this).closest('td')
                        .next()
                        .text();
                if (number) {
                    $.getJSON(apiUrl('pages' + '/' + number)).then(showForm);
                }
                else {
                    showForm(status.defaultPage);
                }
                function showForm(data) {
                    const view = new PageView({model: new Page(data)});
                    openModal('Page', view.$el);
                }
            }

            function displayPage() {
                const number = $(this).data('number') ||
                    $(this).closest('td')
                        .next()
                        .text();
                $.getJSON(apiUrl('pages' + '/' + number) + '?with_lines=1').then(
                    function (pageData) {
                        const template = getTemplate('page-display');
                        openModal('Page ' + number, template(pageData), true);
                    }
                );
            }

            function showPageUploadForm() {
                const template = getTemplate('page-upload-form');
                openModal('Upload Page Images', template({}));
                $('#page-upload-images').on('change', function () {
                    const numbers = [];
                    for (let i = 0; i < this.files.length; i++) {
                        const m = this.files[i].name.match(/\d+/);
                        numbers.push(m ? m[0] : '');
                    }
                    $('#page-upload-numbers').val(numbers.join(','));
                });
                $('#page-upload-form').on('submit', function (evt) {
                    evt.preventDefault();
                    $('#page-upload-form button').prop('disabled', true);
                    fetch(apiUrl('pages/images'), {method: 'post', body: new FormData(this)})
                        .then(function () {
                            $(alertTemplate({
                                successful: true,
                                text: 'Conversion has started. Pages will be available soon.',
                            })).insertAfter('#page-upload-form');
                            setTimeout(() => $('#global-modal').modal('hide'), 1000);
                        })
                        .catch(function (err) {
                            $(alertTemplate({
                                successful: false,
                                text: err.message,
                            })).insertAfter('#page-upload-form');
                            console.error(err);
                        });
                });
            }

            function openModal(title, body, large = false) {
                const $modal = $('#global-modal');
                $('.modal-title', $modal).text(title);
                $('.modal-body', $modal).html(body);
                $('.modal-dialog', $modal).toggleClass('modal-lg', large);
                $modal.modal();
            }
        }

        function backToChecking() {
            $('#top-row').show();
            $('#bottom-row').hide()
                .empty();
            start();
        }

    }

})(jQuery);

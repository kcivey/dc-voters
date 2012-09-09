jQuery(function ($) {

    var rowTemplate = _.template($('#row-template').html());

    $('#results').on('dblclick', 'td', function () {
        selectText(this);
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
        $.each(results, function (i, r) {
            r.name = r.lastname + ', ' + r.firstname;
            if (r.middle) {
                r.name += ' ' + r.middle;
            }
            if (r.suffix) {
                r.name += ', ' + r.suffix;
            }
            r.address = r.res_house + r.res_frac + ' ' + r.res_street;
            if (r.res_apt) {
                r.address += ' #' + r.res_apt;
            }
            tbody.append(rowTemplate(r));
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

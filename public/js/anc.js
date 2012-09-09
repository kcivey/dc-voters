jQuery(function ($) {

    var deadline = new Date(1344459600000); // 5pm Aug 8
    $('.countdown').countdown({
        until: deadline,
        alwaysExpire: true,
        expiryText: 'The filing deadline has passed, but you could still run as a write-in.'
    });

    $('#form-anc').submit(function (evt) {
        var address = $('#address').val(),
            button = $('button', this);
        evt.preventDefault();
        if (!address) {
            return; // don't search if empty
        }
        button.text('Please Wait').attr('disabled', 'disabled');
        $('#info').children().hide();
        $('#info').removeClass('hide');
        $.ajax({
            url: '/findLocation',
            data: {str: address},
            dataType: $.browser.msie ? 'text' : 'xml', // deal with IE bug
            success: handleLocationResponse,
            complete: function () { button.text('Go').removeAttr('disabled'); }
        });
    });

    // From http://jeremyhixon.com/jquery-ajax-internet-explorer/
    function parseXml(xml) {
        if ($.browser.msie) {
            var xmlDoc = new ActiveXObject('Microsoft.XMLDOM');
            xmlDoc.loadXML(xml);
            xml = xmlDoc;
        }
        return xml;
    }

    function handleLocationResponse(xml) {
        var table = $(parseXml(xml)).find('Table1'),
            data = {},
            smd2002, smd2012, ward, anc, url, query;
        table.children().each(function (i, node) {
            data[node.tagName] = node.textContent;
        });
        if (data.FULLADDRESS) {
            $('#info .canonical-address').text(data.FULLADDRESS);
            $('#address-found').show();
        }
        else {
            $('#address-not-found').show();
        }
        if (!data.SMD_2002 || !data.SMD_2002.match(/^(SMD )?[1-8][A-M][01]\d$/)) {
            $.error("Can't find current SMD");
            return;
        }
        smd2002 = data.SMD_2002.replace('SMD ', '');
        $('#info .smd-2002').text(smd2002);
        $('#current-smd').show();
        if (!data.SMD_2012) {
            smd2012 = smd2002;
            $('#smd-not-available').show();
        }
        else {
            smd2012 = data.SMD_2012.replace('SMD ', '');
            if (smd2002 == smd2012) {
                $('#smd-not-changing').show();
            }
            else {
                $('#smd-changing').show();
            }
        }
        ward = smd2012.substr(0, 1);
        anc = smd2012.substr(0, 2);
        // Argh, inconsistent ancdc.us URLs:
        if (ward == 4) {
            url = 'Ward 4 ANC ' + anc + ' 2013 ANC and SMD Boundaries';
        }
        else if (ward == 5) {
            url = 'Ward5 ANC ' + anc + ' Boundaries';
        }
        else {
            url = 'Ward ' + ward + ' ANC ' + anc + ' 2013 Boundaries';
        }
        url = 'http://ancdc.us/' + encodeURIComponent(url) + '.pdf';
        $('#info .smd-2012').text(smd2012);
        $('#info .anc').text(anc);
        $('a.map').attr('href', url);
        query = "SELECT * FROM swdata WHERE smd = '" + smd2002 + "'";
        $.ajax({
            url: 'https://api.scraperwiki.com/api/1.0/datastore/sqlite',
            data: {
                format: 'jsondict',
                name: 'dc_ancs',
                query: query
            },
            dataType: 'jsonp',
            success: handleCommissionerResponse
        });
        query = "SELECT * FROM swdata WHERE smd = '" + smd2012 + "'";
        $.ajax({
            url: 'https://api.scraperwiki.com/api/1.0/datastore/sqlite',
            data: {
                format: 'jsondict',
                name: 'dc_anc_candidates',
                query: query
            },
            dataType: 'jsonp',
            success: handleCandidatesResponse
        });
    }

    function fullName(c) {
        var name = c.first_name + ' ' + c.last_name;
        if (c.suffix) {
            name += ' ' + c.suffix;
        }
        return name;
    }

    function handleCommissionerResponse(data) {
        var c = data[0];
        if (c) {
            $('#info .commissioner').text(fullName(c));
        }
    }

    function handleCandidatesResponse(data) {
        var n = data.length,
            div, ul;
        if (n) {
            div = $('#candidates');
            ul = div.find('ul').empty();
            div.find('.number-candidates').text(n);
            div.find('.candidate-plural').text(n == 1 ? '' : 's');
            div.find('.candidate-verb').text(n == 1 ? 'has' : 'have');
            $.each(data, function (i, c) {
                var text = fullName(c);
                $('<li/>').text(text).appendTo(ul);
            });
            $('#candidates').show();
        }
        else {
            $('#no-candidates').show();
        }
    }

});

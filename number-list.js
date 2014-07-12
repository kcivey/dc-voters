function sortNumber(a, b) {
    return a - b;
}

module.exports = {

    parse: function (s) {
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
    },

    stringify: function (numbers) {
        var list = [],
            currentItem, prevN;
        numbers.sort(sortNumber);
        numbers.push(0);
        numbers.forEach(function (n) {
            if (!prevN || prevN != n - 1) {
                if (currentItem) {
                    if (currentItem != prevN) {
                        currentItem += '-' + prevN;
                    }
                    list.push(currentItem);
                    currentItem = '';
                }
                if (!currentItem) {
                    currentItem = n;
                }
            }
            prevN = n;
        });
        return list.join(', ');
    }
};
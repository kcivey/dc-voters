module.exports = {

    getDtParams(query, defaultLength) {
        const start = +query.start || 0;
        const length = +query.length || defaultLength;
        const draw = +query.draw || 1;
        const search = query.search && query.search.value;
        const columns = query.columns || [];
        const orderFromDataTables = query.order || [];
        const filterColumn = query.filterColumn || '';
        const filterValue = query.filterValue;
        const criteria = {};
        const order = [];
        if (/^\w+$/.test(filterColumn)) {
            criteria[filterColumn] = filterValue;
        }
        for (const o of orderFromDataTables) {
            const index = +o.column || 0;
            const column = columns[index] ? columns[index].data : '';
            if (/^\w+$/.test(column) && column !== 'function') {
                order.push(column + (o.dir === 'desc' ? ' DESC' : ''));
            }
        }
        return {criteria, search, start, length, order, draw};
    },

};

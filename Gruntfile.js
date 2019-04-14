const files = ['package.json', 'package-lock.json'];

module.exports = function (grunt) {
    grunt.initConfig({
        bump: {
            options: {
                commitFiles: files,
                files: files,
                push: false,
            },
        },
    });
    require('load-grunt-tasks')(grunt);
};

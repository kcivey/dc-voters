module.exports = function (grunt) {
    grunt.initConfig({
        bump: {
            options: {
                push: false
            }
        }
    });
    require('load-grunt-tasks')(grunt);
};

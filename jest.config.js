const { createDefaultPreset } = require('ts-jest');

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import('jest').Config} **/
module.exports = {
    testEnvironment: 'node',
    //testRegex: '/src/test-jest/.*\\.test\\.tsx?$',
    transform: {
        ...tsJestTransformCfg,
    },
    moduleNameMapper: {
        '^app/(.*)$': '<rootDir>/src/app/$1',
        '^common/(.*)$': '<rootDir>/src/common/$1',
    },
    roots: [
        '<rootDir>/src/test-jest/'
    ],
};

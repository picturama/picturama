import React from 'react'

import { addSection, action } from 'test-ui/core/UiTester'

import ImportProgressButton, { Props } from 'app/ui/ImportProgressButton'
import Toolbar from 'app/ui/widget/Toolbar'


const defaultProps: Props = {
    progress: { phase: 'scanDirs', isPaused: false, total: 0, processed: 0, added: 0, removed: 0, currentPath: null },
    toggleImportPaused: action('toggleImportPaused'),
    cancelImport: action('cancelImport'),
}


addSection('ImportProgressButton')
    .setDecorator(testView =>
        <Toolbar style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
            {testView}
        </Toolbar>
    )
    .add('scanning dirs', context => (
        <ImportProgressButton
            {...defaultProps}
            progress={{ phase: 'scanDirs', isPaused: false, total: 1240, processed: 0, added: 0, removed: 0, currentPath: '/user/me/documents/mypics/2016/birthday party' }}
        />
    ))
    .add('cleanup', context => (
        <ImportProgressButton
            {...defaultProps}
            progress={{ phase: 'cleanup', isPaused: false, total: 10442, processed: 0, added: 0, removed: 15, currentPath: null }}
        />
    ))
    .add('importPhotos', context => (
        <ImportProgressButton
            {...defaultProps}
            progress={{ phase: 'importPhotos', isPaused: false, total: 10542, processed: 1250, added: 440, removed: 21, currentPath: '/user/me/documents/mypics/2018/summer vacation' }}
        />
    ))
    .add('import-photos 0%', context => (
        <ImportProgressButton
            {...defaultProps}
            progress={{ phase: 'importPhotos', isPaused: false, total: 0, processed: 0, added: 0, removed: 21, currentPath: null }}
        />
    ))
    .add('paused', context => (
        <ImportProgressButton
            {...defaultProps}
            progress={{ phase: 'importPhotos', isPaused: true, total: 10542, processed: 1250, added: 440, removed: 21, currentPath: '/user/me/documents/mypics/2018/summer vacation' }}
        />
    ))
    .add('error', context => (
        <ImportProgressButton
            {...defaultProps}
            progress={{ phase: 'error', isPaused: false, total: 12742, processed: 5780, added: 565, removed: 37, currentPath: '/user/me/documents/mypics/2019/xmas' }}
        />
    ))

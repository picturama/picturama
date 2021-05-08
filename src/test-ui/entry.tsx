import React from 'react'
import { render } from 'react-dom'

import { setLocale, locales, fallbackLocale } from 'common/i18n/i18n'

import UiTester from 'test-ui/core/UiTester'
import 'test-ui/tests/LibraryTest'
import 'test-ui/tests/PhotoDetailPaneTest'
import 'test-ui/tests/SettingsPaneTest'
import 'test-ui/tests/PhotoInfoTest'
import 'test-ui/tests/ImportProgressButtonTest'
import 'test-ui/tests/ExportDialogTest'
import 'test-ui/tests/ErrorToastTest'
import 'test-ui/tests/GridSectionTest'
import 'test-ui/tests/PictureTest'
import 'test-ui/tests/CropOverlayTest'
import 'test-ui/tests/MiniWorldMapTest'
import 'test-ui/tests/IconTest'

import '../app/entry.less'
import './entry.less'


window['UiTester'] = {
    start(elem: HTMLElement) {
        const localeParam = 'locale='
        const localePos = location.href.indexOf(localeParam)
        const locale = (localePos === -1) ? fallbackLocale : location.href.substr(localePos + localeParam.length, 2)

        setLocale(locale)
        render(
            <UiTester locales={locales}/>,
            elem)
    }
}

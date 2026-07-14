import React from 'react'
import { render } from 'react-dom'
import { Provider } from 'react-redux'


import BackgroundClient from 'app/BackgroundClient'
import { showError } from 'app/ErrorPresenter'
import { init as initForegroundService } from 'app/ForegroundService'
import { getLocale, getLocaleTexts, setLocale } from 'app/i18n/i18n'
import { init as initInfoController } from 'app/controller/InfoController'
import App from 'app/ui/main/App'
import { initAction, setWebGLSupport, setDevicePixelRatioAction } from 'app/state/actions'
import store from 'app/state/store'
import { hasWebGLSupport } from 'app/renderer/WebGLCanvas'
import { init as initDataUtil } from 'app/util/DataUtil'
import { observeStore } from 'app/util/ReduxUtil'

import pkgs from '../../package.json'

import './entry.less'


if ((window as any).PICTURAMA_DEV_MODE) {
    document.title = 'Picturama - DEV MODE'
} else {
    document.title = `Picturama - ${pkgs.version}`
}

Promise
    .all([
        BackgroundClient.fetchUiConfig(),
        BackgroundClient.fetchSettings(),
        initForegroundService(),
    ])
    .then(async ([ uiConfig, settings, foregroundReady ]) => {
        setLocale(uiConfig.rawLocale)
        initDataUtil(uiConfig)
        initInfoController()
        store.dispatch(initAction(uiConfig, settings))

        detectDevicePixelRatioChanges()

        if (!hasWebGLSupport()) {
            store.dispatch(setWebGLSupport(false))
        }

        await BackgroundClient.onBeforeRenderUi({
            locale: getLocale(),
            localeTexts: getLocaleTexts(),
        })

        // Enable the File → Export menu item only while a photo selection exists
        // (the menu is built by onBeforeRenderUi above).
        observeStore(
            store,
            state => state.library.selection !== null,
            hasSelection => { BackgroundClient.setExportMenuEnabled(hasSelection) })

        render(
            <Provider store={store}>
                <App/>
            </Provider>,
            document.getElementById('app'))
    })
    .catch(error => {
        showError('Initializing UI failed', error)
    })


function detectDevicePixelRatioChanges() {
    window.addEventListener('resize', updateDevicePixelRatio)
    window.matchMedia('screen and (min-resolution: 2dppx)').addListener(updateDevicePixelRatio)
}


function updateDevicePixelRatio() {
    const { devicePixelRatio } = window
    if (devicePixelRatio !== store.getState().navigation.devicePixelRatio) {
        store.dispatch(setDevicePixelRatioAction(devicePixelRatio))
    }
}

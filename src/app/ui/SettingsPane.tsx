import React, { ReactNode } from 'react'
import { connect } from 'react-redux'
import { Button } from '@blueprintjs/core'
import classnames from 'classnames'
import { FaChevronLeft } from 'react-icons/fa'

import BackgroundClient from 'app/BackgroundClient'
import { Settings } from 'app/CommonTypes'
import { showError } from 'app/ErrorPresenter'
import { msg } from 'app/i18n/i18n'
import LicenseDialog from 'app/ui/license/LicenseDialog'
import Toolbar from 'app/ui/widget/Toolbar'
import List from 'app/ui/widget/List'
import LogoDecoration from 'app/ui/widget/LogoDecoration'
import { setSettingsAction, closeSettingsAction } from 'app/state/actions'
import { AppState } from 'app/state/StateTypes'
import { bindMany } from 'app/util/LangUtil'

import './SettingsPane.less'


export interface OwnProps {
    style?: any
    className?: any
}

interface StateProps {
    settings: Settings
    version: string
}

interface DispatchProps {
    selectDirectories(): Promise<string[] | undefined>
    onSettingsChange(settings: Settings): void
    onClose(settings: Settings, startImport: boolean): void
}

export interface Props extends OwnProps, StateProps, DispatchProps {}

interface State {
    showLicenses: boolean
}

export class SettingsPane extends React.Component<Props, State> {

    constructor(props: Props) {
        super(props)
        this.state = { showLicenses: false }
        bindMany(this, 'onPhotoDirsChange', 'onAddPhotoDir', 'onClose', 'onCloseAndImport', 'getDecorationWidth',
            'onShowLicenses', 'onLicensesClosed')
    }

    private onPhotoDirsChange(photoDirs: string[]) {
        this.props.onSettingsChange({ ...this.props.settings, photoDirs })
    }

    private onAddPhotoDir() {
        const { props } = this
        props.selectDirectories()
            .then(dirs => {
                if (dirs) {
                    const nextPhotoDirs = [ ...props.settings.photoDirs, ...dirs ]
                    nextPhotoDirs.sort()
                    props.onSettingsChange({ ...props.settings, photoDirs: nextPhotoDirs })
                }
            })
            .catch(error => {
                console.error('Selecting dirs failed', error)
            })
    }

    private onClose() {
        this.props.onClose(this.props.settings, false)
    }

    private onCloseAndImport() {
        this.props.onClose(this.props.settings, true)
    }

    private onShowLicenses() {
        this.setState({ showLicenses: true })
    }

    private onLicensesClosed() {
        this.setState({ showLicenses: false })
    }

    private getDecorationWidth(containerWidth: number): number {
        return containerWidth - 800
    }

    render() {
        const { props, state } = this
        const { settings } = props
        return (
            <div className={classnames(props.className, 'SettingsPane')} style={props.style}>
                <LogoDecoration getDecorationWidth={this.getDecorationWidth}/>
                <Toolbar
                    className="SettingsPane-topBar"
                    isTopBar={true}
                    isLeft={true}
                >
                    <Button onClick={this.onClose}>
                        <FaChevronLeft/>
                        <span>{msg('common_backToLibrary')}</span>
                    </Button>
                    <Toolbar.Spacer isTopBar/>
                </Toolbar>                
                <div className='SettingsPane-body'>
                    <div className='SettingsPane-content'>
                        <h1>{msg('Settings_title')}</h1>
                        {settings.photoDirs.length === 0 &&
                            <p>{msg('Settings_selectPhotoDirs')}</p>
                        }
                        {settings.photoDirs.length > 0 &&
                            <>
                                <p>{msg('Settings_photoDirs')}</p>
                                <List
                                    items={settings.photoDirs}
                                    renderItem={renderPhotoDir}
                                    onItemsChange={this.onPhotoDirsChange}
                                />
                            </>
                        }
                        <Button
                            className='SettingsPane-addPhotoDir'
                            text={msg('Settings_addPhotoDir')}
                            onClick={this.onAddPhotoDir}
                        />
                    </div>
                </div>
                <div className='SettingsPane-footer'>
                    <Button
                        className='SettingsPane-scan'
                        large={true}
                        intent='primary'
                        text={msg('Settings_startScan')}
                        onClick={this.onCloseAndImport}
                    />
                    <div className='SettingsPane-about'>
                        <span>Picturama</span>
                        <span className='SettingsPane-appVersion'>{props.version}</span>
                        <Button
                            small
                            text={msg('common_licenses')}
                            onClick={this.onShowLicenses}
                        />
                    </div>
                </div>
                {state.showLicenses &&
                    <LicenseDialog onClosed={this.onLicensesClosed}/>
                }
            </div>
        )
    }

}


function renderPhotoDir(photoDir: string): ReactNode {
    return photoDir
}


const Connected = connect<StateProps, DispatchProps, OwnProps, AppState>(
    (state: AppState, props: OwnProps) => {
        return {
            ...props,
            settings: state.data.settings,
            version: state.data.uiConfig.version,
        }
    },
    dispatch => ({
        selectDirectories: BackgroundClient.selectScanDirectories,
        onSettingsChange(settings: Settings) {
            dispatch(setSettingsAction(settings))
        },
        onClose(settings: Settings, startImport: boolean) {
            dispatch(closeSettingsAction())
            BackgroundClient.storeSettings(settings)
                .then(() => {
                    if (startImport) {
                        BackgroundClient.startImport()
                    }
                })
                .catch(error => {
                    showError('Applying new settings failed', error)
                })
        },
    })
)(SettingsPane)

export default Connected

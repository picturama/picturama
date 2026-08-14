import React from 'react'
import { Dialog, NonIdealState, Spinner, SpinnerSize } from '@blueprintjs/core'
import { FaFrownOpen } from 'react-icons/fa'

import BackgroundClient from 'app/BackgroundClient'
import { LicensedComponent, Licenses } from 'app/CommonTypes'
import { msg } from 'app/i18n/i18n'
import LicenseButton from 'app/ui/license/LicenseButton'
import { bindMany } from 'app/util/LangUtil'

import './LicenseDialog.less'


// Picturama's own license and the licenses of everything a build ships with it.
//
// The data comes from `licenses.json.gz`, written by `src/script/collect-licenses.mjs` and read by the
// `fetchLicenses` command. Picturama itself is in there under `own`, so the text shown at the top comes from
// the same place as the rest instead of being a copy kept in the UI.
//
// Every license is shown alike and none is singled out: MIT, the BSD licenses and Apache-2.0 ask for the
// notice just as the LGPL does.


export interface Props {
    usePortal?: boolean
    onClosed(): void
}

interface State {
    isOpen: boolean
    licenses?: Licenses
    error?: string
}

export default class LicenseDialog extends React.Component<Props, State> {

    constructor(props: Props) {
        super(props)
        this.state = { isOpen: true }
        bindMany(this, 'onClose')
    }

    componentDidMount() {
        BackgroundClient.fetchLicenses()
            .then(licenses => this.setState({ licenses }))
            .catch(error => {
                // Showing the reason beats an empty dialog: in a development build the answer is almost always
                // that `npm run licenses` has not been run yet.
                console.error('Fetching licenses failed', error)
                this.setState({ error: String(error) })
            })
    }

    private onClose() {
        this.setState({ isOpen: false })
    }

    render() {
        const { props, state } = this
        return (
            <Dialog
                className='LicenseDialog'
                usePortal={props.usePortal}
                isOpen={state.isOpen}
                title={msg('common_licenses')}
                onClose={this.onClose}
                onClosed={props.onClosed}
            >
                <div className='LicenseDialog-body'>
                    {state.error &&
                        <NonIdealState
                            icon={<FaFrownOpen/>}
                            title={msg('common_error')}
                            description={state.error}
                        />
                    }
                    {!state.error && !state.licenses &&
                        <Spinner size={SpinnerSize.LARGE}/>
                    }
                    {state.licenses && this.renderLicenses(state.licenses)}
                </div>
            </Dialog>
        )
    }

    private renderLicenses(licenses: Licenses) {
        return (
            <>
                <p>{msg('LicenseDialog_intro')}</p>
                {renderTexts(licenses.own, licenses)}
                <p className='LicenseDialog-libraries'>{msg('LicenseDialog_libraries')}</p>
                {licenses.libraries.map(library =>
                    <div key={`${library.name} ${library.version}`} className='LicenseDialog-library'>
                        <div className='LicenseDialog-libraryHead'>
                            <div className='LicenseDialog-name'>{library.name}</div>
                            <span className='LicenseDialog-version'>{library.version}</span>
                            <span className='LicenseDialog-license'>{library.license}</span>
                        </div>
                        {library.note &&
                            <div className='LicenseDialog-note'>{library.note}</div>
                        }
                        {renderTexts(library, licenses)}
                    </div>
                )}
            </>
        )
    }

}


function renderTexts(component: LicensedComponent, licenses: Licenses) {
    return component.texts.map(ref =>
        <LicenseButton
            key={ref.key}
            className='LicenseDialog-licenseButton'
            name={ref.name}
            text={licenses.texts[ref.key]}
        />
    )
}

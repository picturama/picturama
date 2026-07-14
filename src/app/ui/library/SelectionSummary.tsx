import React from 'react'
import classnames from 'classnames'
import { Button } from '@blueprintjs/core'

import { msg } from 'app/i18n/i18n'
import { formatNumber } from 'app/util/TextUtil'

import './SelectionSummary.less'


export interface Props {
    className?: any
    selectedCount: number
    onClearSelection(): void
}

export default class SelectionSummary extends React.Component<Props> {

    render() {
        const { props } = this
        return (
            <div className={classnames(props.className, 'SelectionSummary')}>
                <div className='SelectionSummary-selected'>
                    {msg('SelectionSummary_selected', formatNumber(props.selectedCount))}
                </div>
                <Button
                    icon='cross'
                    minimal={true}
                    title={msg('SelectionSummary_clearSelection')}
                    onClick={props.onClearSelection}
                />
            </div>
        )
    }

}

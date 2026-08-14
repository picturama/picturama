import React from 'react'
import { Card, Icon } from '@blueprintjs/core'
import classNames from 'classnames'

import { bindMany } from 'app/util/LangUtil'

import './LicenseButton.less'


// A license name that expands into its text.
//
// Collapsed - which is how it starts - the text is not in the DOM at all, which is the point: a build lists
// several hundred components, and their texts together are megabytes. Blueprint's `Collapse` would keep them
// all rendered and only hide them.


interface Props {
    className?: any
    name: string
    text: string
}

interface State {
    isExpanded: boolean
}

export default class LicenseButton extends React.Component<Props, State> {

    constructor(props: Props) {
        super(props)
        this.state = { isExpanded: false }
        bindMany(this, 'onToggle')
    }

    private onToggle() {
        this.setState({ isExpanded: !this.state.isExpanded })
    }

    render() {
        const { props, state } = this

        return (
            <Card
                className={classNames(props.className, 'LicenseButton', { isExpanded: state.isExpanded })}
                interactive
                onClick={this.onToggle}
            >
                <div className='LicenseButton-title'>
                    <Icon
                        className='LicenseButton-icon'
                        icon={state.isExpanded ? 'chevron-down' : 'chevron-right'}
                    />
                    {props.name}
                </div>
                {state.isExpanded &&
                    <pre className='LicenseButton-text'>{props.text}</pre>
                }
            </Card>
        )
    }

}

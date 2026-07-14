import React from 'react'
import classnames from 'classnames'
import { MdRotateLeft, MdRotateRight } from 'react-icons/md'
import { Button, ButtonGroup } from '@blueprintjs/core'

import { msg } from 'app/i18n/i18n'
import { SVG_ICON_CLASS } from 'app/ui/widget/icon/SvgIcon'
import { bindMany } from 'app/util/LangUtil'


export interface Props {
    className?: any
    disabled?: boolean
    onRotate(turns: number): void
}

export default class RotateButtonGroup extends React.Component<Props> {

    constructor(props: Props) {
        super(props)
        bindMany(this, 'rotateLeft', 'rotateRight')
    }

    rotateLeft() {
        this.props.onRotate(-1)
    }

    rotateRight() {
        this.props.onRotate(1)
    }

    render() {
        const { props } = this
        return (
            <ButtonGroup className={classnames(props.className, 'RotateButtonGroup')}>
                <Button minimal={true} disabled={props.disabled} onClick={this.rotateLeft} title={msg('RotateButtonGroup_rotateLeft')}>
                    <MdRotateLeft className={SVG_ICON_CLASS}/>
                </Button>
                <Button minimal={true} disabled={props.disabled} onClick={this.rotateRight} title={msg('RotateButtonGroup_rotateRight')}>
                    <MdRotateRight className={SVG_ICON_CLASS}/>
                </Button>
            </ButtonGroup>
        )
    }

}

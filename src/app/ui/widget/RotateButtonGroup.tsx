import React from 'react'
import classnames from 'classnames'
import { MdRotateLeft, MdRotateRight } from 'react-icons/md'
import { Button, ButtonGroup } from '@blueprintjs/core'

import { addCommandGroup, Command, CommandGroupId, getCommandButtonProps, removeCommandGroup, setCommandGroupEnabled } from 'app/controller/HotkeyController'
import { msg } from 'app/i18n/i18n'
import { SVG_ICON_CLASS } from 'app/ui/widget/icon/SvgIcon'
import { bindMany } from 'app/util/LangUtil'


type CommandKeys = 'rotateLeft' | 'rotateRight'


export interface Props {
    className?: any
    isActive: boolean
    disabled?: boolean
    onRotate(turns: number): void
}

export default class RotateButtonGroup extends React.Component<Props> {

    private commands: { [K in CommandKeys]: Command }
    private commandGroupId: CommandGroupId = -1

    constructor(props: Props) {
        super(props)
        bindMany(this, 'rotateLeft', 'rotateRight')

        const enabled = () => !this.props.disabled
        this.commands = {
            rotateLeft:  { combo: 'l', enabled, label: msg('RotateButtonGroup_rotateLeft'), onAction: this.rotateLeft },
            rotateRight: { combo: 'r', enabled, label: msg('RotateButtonGroup_rotateRight'), onAction: this.rotateRight },
        }
    }

    componentDidMount() {
        this.commandGroupId = addCommandGroup(this.commands, this.props.isActive)
    }

    componentDidUpdate(prevProps: Props) {
        const { props } = this
        if (props.isActive !== prevProps.isActive) {
            setCommandGroupEnabled(this.commandGroupId, props.isActive)
        }
    }

    componentWillUnmount() {
        removeCommandGroup(this.commandGroupId)
    }

    rotateLeft() {
        this.props.onRotate(-1)
    }

    rotateRight() {
        this.props.onRotate(1)
    }

    render() {
        const { props, commands } = this
        return (
            <ButtonGroup className={classnames(props.className, 'RotateButtonGroup')}>
                <Button minimal {...getCommandButtonProps(commands.rotateLeft)}>
                    <MdRotateLeft className={SVG_ICON_CLASS}/>
                </Button>
                <Button minimal {...getCommandButtonProps(commands.rotateRight)}>
                    <MdRotateRight className={SVG_ICON_CLASS}/>
                </Button>
            </ButtonGroup>
        )
    }

}

import classNames from 'classnames'
import React from 'react'
import { Slider, MaybeElement } from '@blueprintjs/core'

import { minGridRowHeight, maxGridRowHeight } from 'app/UiConstants'
import Toolbar from 'app/ui/widget/Toolbar'

import './LibraryBottomBar.less'


interface Props {
    className?: any
    leftItem?: MaybeElement
    showSlider: boolean
    gridRowHeight: number
    setGridRowHeight: (gridRowHeight: number) => void
}

export default class LibraryBottomBar extends React.Component<Props> {
    render() {
        const { props } = this
        if (!props.showSlider && !props.leftItem) {
            return null
        }
        return (
            <Toolbar className={classNames(props.className, 'LibraryBottomBar')} isTopBar={false}>
                {props.showSlider &&
                    <Slider
                        className='LibraryBottomBar-slider'
                        value={props.gridRowHeight}
                        min={minGridRowHeight}
                        max={maxGridRowHeight}
                        labelRenderer={false}
                        showTrackFill={false}
                        onChange={props.setGridRowHeight}
                    />
                }
                {props.leftItem}
            </Toolbar>
        )
    }
}

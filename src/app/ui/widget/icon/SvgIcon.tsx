import classNames from 'classnames'
import React from 'react'

import { Size, isSize } from 'app/util/GeometryTypes'

import './SvgIcon.less'


export const SVG_ICON_CLASS = 'SvgIcon'

export type SvgIconFactory = React.Factory<SvgIconProps>

export interface SvgIconProps {
    className?: any
    style?: any
    children?: any
    size?: number | string | Size
    width?: number | string
    height?: number | string
    color?: string
}

export interface Props extends SvgIconProps {
    viewBox?: string
}

/**
 * Base class for SVG icons
 */
export default class SvgIcon extends React.Component<Props> {
    static defaultProps: Partial<Props> = {
        color: 'currentColor'
    }

    render() {
        const props = this.props
        const size = props.size || '1em'
        return (
            <svg
                className={classNames(props.className, SVG_ICON_CLASS)}
                style={props.style}
                width={props.width || (isSize(size) ? size.width : size) }
                height={props.height || (isSize(size) ? size.height : size) }
                fill={props.color}
                viewBox={props.viewBox}
                preserveAspectRatio='xMidYMid meet'
            >
                {props.children}
            </svg>
        )
    }
}

import * as React from 'react'

import { Size } from 'app/util/GeometryTypes'

import SvgIcon, { SvgIconProps, SvgIconFactory } from './SvgIcon'


export const customSizeSideIconSize: Size = { width: 92, height: 45 }

export const CustomSizeSideWidth = (props: SvgIconProps) => (
    <SvgIcon viewBox='0 0 92 45' {...props}>
        <g transform="translate(0.5, 0.5)">
            <path d="M48,37 L78,37 78,14 48,14 Z" fill="white" fillOpacity="1" stroke="black" strokeWidth="1" strokeOpacity="0.3" strokeLinejoin="round"/>
            <path d="M12,37 L42,37 42,0 12,0 Z" fill="white" fillOpacity="1" stroke="black" strokeWidth="1" strokeOpacity="0.3" strokeLinejoin="round"/>
            <path d="M48,41 l0,3 30,0 0,-3" fill="none" stroke="black" strokeWidth="1"/>
            <path d="M12,41 l0,3 30,0 0,-3" fill="none" stroke="black" strokeWidth="1"/>
        </g>
    </SvgIcon>
)

export const CustomSizeSideHeight = (props: SvgIconProps) => (
    <SvgIcon viewBox='0 0 92 45' {...props}>
        <g transform="translate(0.5, 0.5)">
            <path d="M0,37 L23,37 23,7 0,7 Z" fill="white" fillOpacity="1" stroke="black" strokeWidth="1" strokeOpacity="0.3" strokeLinejoin="round"/>
            <path d="M45,37 L83,37 83,7 45,7 Z" fill="white" fillOpacity="1" stroke="black" strokeWidth="1" strokeOpacity="0.3" strokeLinejoin="round"/>
            <path d="M27,7 l3,0 0,30 -3,0" fill="none" stroke="black" strokeWidth="1"/>
            <path d="M87,7 l3,0 0,30 -3,0" fill="none" stroke="black" strokeWidth="1"/>
        </g>
    </SvgIcon>
)

export const CustomSizeSideSize = (props: SvgIconProps) => (
    <SvgIcon viewBox='0 0 92 45' {...props}>
        <g transform="translate(0.5, 0.5)">
            <path d="M53,10 L53,33 83,33 83,10 Z" fill="white" fillOpacity="1" stroke="black" strokeWidth="1" strokeOpacity="0.3" strokeLinejoin="round"/>
            <path d="M8,34 L32,34 32,4 8,4 Z" fill="white" fillOpacity="1" stroke="black" strokeWidth="1" strokeOpacity="0.3" strokeLinejoin="round"/>
            <path d="M36,4 l3,0 0,30 -3,0" fill="none" stroke="black" strokeWidth="1"/>
            <path d="M53,38 l0,3 30,0 0,-3" fill="none" stroke="black" strokeWidth="1"/>
        </g>
    </SvgIcon>
)

export default { CustomSizeSideWidth, CustomSizeSideHeight, CustomSizeSideSize } as { [key: string]: SvgIconFactory }

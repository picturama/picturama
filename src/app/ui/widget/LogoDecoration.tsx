import React from 'react'
import { findDOMNode } from 'react-dom'
import classnames from 'classnames'

import { bindMany } from 'common/util/LangUtil'

import Logo, { logoAspect } from 'app/ui/widget/icon/Logo'


const offsetX = 0.25
const offsetY = offsetX / logoAspect


export interface Props {
    className?: any
    getDecorationWidth(containerWidth: number): number
}

interface State {
    decorationWidth: number
}

export default class LogoDecoration extends React.Component<Props, State> {

    private resizeObserver: ResizeObserver | null

    constructor(props: Props) {
        super(props)
        this.state = { decorationWidth: 0 }
        bindMany(this, 'onResize')
    }

    componentDidMount() {
        this.onResize()

        const mainElem = findDOMNode(this.refs.main) as HTMLElement
        const parentElement = mainElem && mainElem.parentElement!

        this.resizeObserver = new ResizeObserver(this.onResize)
        this.resizeObserver.observe(parentElement)
    }

    componentWillUnmount() {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect()
            this.resizeObserver = null
        }
    }

    private onResize() {
        const mainElem = findDOMNode(this.refs.main) as HTMLElement
        const parentElement = mainElem && mainElem.parentElement
        if (parentElement) {
            this.setState({ decorationWidth: this.props.getDecorationWidth(parentElement.offsetWidth) })
        }
    }

    render() {
        const { props, state } = this
        
        if (state.decorationWidth < 150) {
            return (
                <div ref='main' className={classnames(props.className, 'LogoDecoration')}/>
            )
        }
            
        const logoWidth = Math.round(state.decorationWidth * (1 + offsetX))
        const logoHeight = Math.round(logoWidth / logoAspect)
        return (
            <Logo
                ref='main'
                className={classnames(props.className, 'LogoDecoration')}
                width={logoWidth}
                height={logoHeight}
                style={{ position: 'absolute', right: -Math.round(logoWidth * offsetX), bottom: -Math.round(logoHeight * offsetY) }}
            />
        )
    }

}

import React from 'react'
import { Button, ButtonGroup } from '@blueprintjs/core'

import { TestContext } from 'test-ui/core/UiTester'


export type ParameterSpec<Key extends string> = { [k in Key]: { label: string, defaultValue?: boolean } }
export type ParameterValues<Key extends string> = { [k in Key]: boolean }

export interface Props<ParameterKey extends string> {
    testWrapperStyle?: any
    forceRedrawOnChange?: boolean
    context: TestContext
    parameterSpec: ParameterSpec<ParameterKey>
    renderTest(context: TestContext, params: ParameterValues<ParameterKey>): JSX.Element
}

interface State {
    prevRenderTest?: Function
    forceRedraw: boolean
}

export default class ParameterTestDecorator<ParameterKey extends string> extends React.Component<Props<ParameterKey>, State> {

    static getDerivedStateFromProps(nextProps: Props<string>, prevState: State): Partial<State> | null {
        if (nextProps.renderTest !== prevState.prevRenderTest && nextProps.forceRedrawOnChange !== false) {
            return { prevRenderTest: nextProps.renderTest, forceRedraw: true }
        }
        return null
    }

    constructor(props: Props<ParameterKey>) {
        super(props)
        this.state = { forceRedraw: false }
    }

    private getParameterValues(): ParameterValues<ParameterKey> {
        const { context, parameterSpec } = this.props
        const paramKeys = Object.keys(parameterSpec) as ParameterKey[]

        let params: ParameterValues<ParameterKey> | undefined = context.state.params
        if (!params) {
            params = {} as ParameterValues<ParameterKey>
            for (const key of paramKeys) {
                params[key] = parameterSpec[key].defaultValue || false
            }
            context.state.params = params
        }
        return params
    }

    render() {
        const { props, state } = this
        const { parameterSpec } = props

        const paramKeys = Object.keys(parameterSpec) as ParameterKey[]
        const params = this.getParameterValues()

        if (this.state.forceRedraw) {
            this.setState({ forceRedraw: false })
        }

        return (
            <div>
                <div style={{ ...props.testWrapperStyle, display: 'inline-block' }}>
                    {!state.forceRedraw && props.renderTest(props.context, params)}
                </div>
                <ButtonGroup
                    style={{ display: 'inline-block', verticalAlign: 'top', marginLeft: 50 }}
                    vertical={true}
                >
                    {paramKeys.map(key =>
                        <Button
                            key={key}
                            active={params[key]}
                            text={parameterSpec[key].label}
                            onClick={() => {
                                params[key] = !params[key]
                                props.context.forceUpdate()
                            }}
                        />
                    )}
                </ButtonGroup>
            </div>
        )
    }

}

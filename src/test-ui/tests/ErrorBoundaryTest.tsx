import React from 'react'

import { gridBg } from 'app/style/variables'
import ErrorBoundary from 'app/ui/widget/ErrorBoundary'

import { addSection, action } from 'test-ui/core/UiTester'


addSection('ErrorBoundary')
    .setArenaStyle({ backgroundColor: gridBg })
    .add('normal', context => (
        <ErrorBoundary className='bp3-dark'>
            <ErrorChild/>
        </ErrorBoundary>
    ))


export default class ErrorChild extends React.Component<{}> {

    render() {
        throw new Error('Test')
    }

}

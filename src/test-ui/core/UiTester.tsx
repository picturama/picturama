import React from 'react'
import classnames from 'classnames'
import { ButtonGroup, Button } from '@blueprintjs/core'

import { getLocale } from 'app/i18n/i18n'

import './UiTester.less'


// UI-Tester. Inspired by [react-storyboard](https://github.com/storybooks/react-storybook) - but not so bloated


let sections: Section[] = []


export interface TestContext {
    state: any
    forceUpdate: () => void
}

interface Test {
    title: string
    renderTest: (context: TestContext) => JSX.Element
    path: string
    state: any
}


interface Section {
    title: string
    tests: Test[]
    arenaStyle?: any
    renderDecorator?: (testView: JSX.Element) => JSX.Element
}


interface SectionBuilder {
    setArenaStyle(style: any): this
    setDecorator(renderDecorator: (testView: JSX.Element) => JSX.Element): this
    add(title: string, renderTest: (context: TestContext) => JSX.Element): this
}


export function clearAll() {
    sections = []
}

export function addSection(sectionTitle: string): SectionBuilder {
    const tests: Test[] = [],
        section: Section = { title: sectionTitle, tests }

    sections.push(section)

    const sectionBuilder: SectionBuilder = {
        setArenaStyle(style: any) {
            section.arenaStyle = style
            return sectionBuilder
        },

        setDecorator(renderDecorator: (testView: JSX.Element) => JSX.Element) {
            section.renderDecorator = renderDecorator
            return sectionBuilder
        },

        add(title: string, renderTest: (context: TestContext) => JSX.Element) {
            tests.push({
                title,
                renderTest,
                path: '/' + encodePathItem(sectionTitle) + '/' + encodePathItem(title),
                state: {}
            })
            return sectionBuilder
        }
    }

    return sectionBuilder
}


function encodePathItem(pathItem: string) {
    return encodeURIComponent(pathItem.replace(/[ /_]+/g, '_'))
}


export function action(name: string) {
    return (...args: any[]) => {
        console.log('Action ' + name + ':', ...args)
    }
}


interface Props {
    className?: any
    locales: string[]
}

interface State {
    prevSections: Section[] | null
    currentSection: Section | null
    currentTest: Test | null
}

export default class UiTester extends React.Component<Props, State> {

    static getDerivedStateFromProps(nextProps: Props, prevState: State): Partial<State> | null {
        if (sections !== prevState.prevSections) {
            let currentSection: Section | null = null,
                currentTest: Test | null = null,
                path = location.hash.substring(1) // Remove leading `#`

            for (let section of sections) {
                for (let test of section.tests) {
                    if (test.path == path) {
                        currentSection = section
                        currentTest = test
                        break
                    }
                }

                if (currentTest) {
                    break
                }
            }

            return {
                prevSections: sections,
                currentSection,
                currentTest
            }
        }

        return null
    }

    constructor(props: Props) {
        super(props)
        this.state = {
            prevSections: null,
            currentSection: null,
            currentTest: null
        }
    }

    _showTest(section: Section, test: Test) {
        this.setState({ currentSection: section, currentTest: test })
        location.hash = test.path
    }

    render() {
        const props = this.props
        const state = this.state
        const locale = getLocale()

        let testView: JSX.Element | null = null
        let arenaStyle: any = undefined
        if (state.currentSection && state.currentTest) {
            testView = state.currentTest.renderTest({
                forceUpdate: this.forceUpdate.bind(this),
                state: state.currentTest.state
            })
            arenaStyle = state.currentSection.arenaStyle
            if (state.currentSection.renderDecorator) {
                testView = state.currentSection.renderDecorator(testView)
            }
        }

        return (
            <div className={classnames(props.className, 'UiTester')}>
                <div className="UiTester-sidebar">
                    <ButtonGroup className='UiTester-localeSwitch'>
                        {props.locales.map(loc =>
                            <Button
                                key={loc}
                                text={loc}
                                active={loc === locale}
                                disabled={loc === locale}
                                onClick={
                                    loc === locale ? undefined :
                                    () => {
                                        location.href = location.origin + location.pathname + '?locale=' + loc + location.hash
                                    }
                                }
                            />
                        )}
                    </ButtonGroup>
                    {sections.map((section, sectionIndex) =>
                        <div key={sectionIndex}>
                            <div className='UiTester-sectionTitle'>
                                {section.title}
                            </div>
                            <ButtonGroup
                                className='UiTester-sectionButtons'
                                vertical={true}
                            >
                                {section.tests.map((test, testIndex) =>
                                    <Button
                                        key={testIndex}
                                        active={test == state.currentTest}
                                        text={test.title}
                                        onClick={() => this._showTest(section, test)}
                                    />
                                )}
                            </ButtonGroup>
                        </div>
                    )}
                </div>
                <div className="UiTester-arena" style={arenaStyle}>
                    {testView}
                </div>
            </div>
        )
    }

}

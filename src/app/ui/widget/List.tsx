import React, { ReactNode } from 'react'
import { Button } from '@blueprintjs/core'
import classnames from 'classnames'

import { bindMany } from 'app/util/LangUtil'

import './List.less'


export interface Props<ItemType> {
    className?: any
    items: ItemType[]
    renderItem(item: ItemType, itemIndex: number): ReactNode
    onItemsChange(items: ItemType[]): void
}

export default class List<ItemType> extends React.Component<Props<ItemType>> {

    constructor(props: Props<ItemType>) {
        super(props)
        this.state = {}
        bindMany(this, 'onRemoveClick')
    }

    private onRemoveClick(event: React.MouseEvent) {
        const { props } = this

        let elem: HTMLElement | null = event.target as HTMLElement
        let itemIndex: number | null = null
        while (elem) {
            if (elem.dataset.itemIndex != null) {
                itemIndex = parseInt(elem.dataset.itemIndex)
            }
            elem = elem.parentElement
        }

        if (itemIndex != null) {
            const nextItems = [ ...props.items ]
            nextItems.splice(itemIndex, 1)
            props.onItemsChange(nextItems)
        }
    }

    render() {
        const { props } = this
        return (
            <div className={classnames(props.className, 'List')}>
                {props.items.map((item, itemIndex) =>
                    <div key={itemIndex} className={classnames('List-row')} data-item-index={itemIndex}>
                        <div className='List-item'>
                            {props.renderItem(item, itemIndex)}
                        </div>
                        <Button
                            className='List-removeItem'
                            minimal={true}
                            icon='cross'
                            onClick={this.onRemoveClick}
                        />
                    </div>
                )}
            </div>
        )
    }

}

import React from 'react'
import { connect } from 'react-redux'
import { Popover, Button, IconName, Position, Menu, MenuItem, MenuDivider } from '@blueprintjs/core'
import classnames from 'classnames'

import { msg } from 'common/i18n/i18n'
import { TagId, TagById, Device, PhotoFilter } from 'common/CommonTypes'

import { setLibraryFilter } from 'app/controller/PhotoController'
import { AppState } from 'app/state/StateTypes'

import './LibraryFilterButton.less'


type SimpleFilterType = 'all' | 'favorites' | 'trash'
const simpleFilterTypes: SimpleFilterType[] = [ 'all', 'favorites', 'trash' ]
    // TODO: Revive Legacy code of 'version' feature
    // -> Add 'processed'

type FilterType = SimpleFilterType | 'tag'

const iconByFilterType: { [K in FilterType]: IconName | JSX.Element } = {
    all: 'book',
    favorites: 'star',
    // TODO: Revive Legacy code of 'version' feature
    //processed: 'settings',
    trash: 'trash',
    tag: 'tag',
}

export interface OwnProps {
    className?: any
}

interface StateProps {
    libraryFilter: PhotoFilter
    tagIds: TagId[]
    tagById: TagById
    devices: Device[]
}

interface DispatchProps {
    setLibraryFilter(newFilter: PhotoFilter): void
}

export interface Props extends OwnProps, StateProps, DispatchProps {}

export class LibraryFilterButton extends React.Component<Props> {

    private onSimpleFilterClick(type: SimpleFilterType) {
        this.props.setLibraryFilter({ type })
    }

    private onTagFilterClick(tagId: TagId) {
        this.props.setLibraryFilter({ type: 'tag', tagId })
    }

    render() {
        const { props } = this
        const { libraryFilter } = props

        const menu = (
            <Menu className='LibraryFilterButton-menu'>
                {simpleFilterTypes.map(type =>
                    <MenuItem
                        key={type}
                        icon={iconByFilterType[type]}
                        text={msg(`LibraryFilterButton_filter_${type}` as any)}
                        active={type === libraryFilter.type}
                        onClick={() => this.onSimpleFilterClick(type)}
                    />
                )}
                {!!props.tagIds.length &&
                    <>
                        <MenuDivider title={msg('LibraryFilterButton_tag_title')} />
                        {props.tagIds.map(tagId =>
                            <MenuItem
                                key={tagId}
                                icon={iconByFilterType['tag']}
                                text={props.tagById[tagId].title}
                                active={!!(libraryFilter.type === 'tag' && libraryFilter.tagId === tagId)}
                                onClick={() => this.onTagFilterClick(tagId)}
                            />
                        )}
                    </>
                }
            </Menu>
        )

        let activeFilterLabel: string
        if (libraryFilter.type === 'tag') {
            activeFilterLabel = msg('LibraryFilterButton_filter_tag', props.tagById[libraryFilter.tagId].title)
        } else {
            activeFilterLabel = msg(`LibraryFilterButton_filter_${libraryFilter.type}` as any)
        }

        return (
            <Popover
                className={classnames(props.className, 'LibraryFilterButton')}
                content={menu}
                position={Position.BOTTOM}
            >
                <Button
                    minimal={true}
                    rightIcon='caret-down'
                    text={msg('LibraryFilterButton_shown', activeFilterLabel)} />
            </Popover>
        )
    }

}


const Connected = connect<StateProps, DispatchProps, OwnProps, AppState>(
    (state: AppState, props: OwnProps) => {
        return {
            ...props,
            libraryFilter: state.library.filter,
            tagIds: state.data.tags.ids,
            tagById: state.data.tags.byId,
            devices: state.data.devices,
        }
    },
    dispatch => ({
        setLibraryFilter,
    })
)(LibraryFilterButton)

export default Connected

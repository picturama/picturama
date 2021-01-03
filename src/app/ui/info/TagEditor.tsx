import classNames from 'classnames'
import React from 'react'
import { MenuItem, Spinner } from '@blueprintjs/core'
import { MultiSelect, IItemRendererProps } from "@blueprintjs/select"

import { Photo, PhotoDetail } from 'common/CommonTypes'
import { msg } from 'common/i18n/i18n'
import { bindMany, slug } from 'common/util/LangUtil'


const StringMultiSelect = MultiSelect.ofType<string>()

interface Props {
    className?: any
    photo?: Photo
    photoDetail: PhotoDetail | null
    tags: string[]
    setPhotoTags: (photo: Photo, tags: string[]) => void
}

interface State {
    prevQuery: string
    prevTags: string[]
    prevPhotoTags: string[]
    query: string
    tagsSlugged: string[]
    photoTagsSlugged: string[]
    /** The tag name of the new tag. Only set if query is empty or doesn't match an existing tag */
    newTag: string | null
    activeTag: string | null
    selectableTags: string[]
}

export default class TagEditor extends React.Component<Props, State> {

    static getDerivedStateFromProps(props: Props, state: State): State | null {
        const query = state.query

        if (!props.photoDetail || (query === state.prevQuery && props.tags === state.prevTags && props.photoDetail.tags === state.prevPhotoTags)) {
            return null
        }

        const querySlugged = slug(query)

        let tagsSlugged = state.tagsSlugged
        if (props.tags !== state.prevTags) {
            tagsSlugged = props.tags.map(tag => slug(tag))
        }

        let photoTagsSlugged = state.photoTagsSlugged
        if (props.photoDetail.tags !== state.prevPhotoTags) {
            photoTagsSlugged = props.photoDetail.tags.map(tag => slug(tag))
        }

        let selectableTags: string[] = []
        let activeTag: string | null = null
        let newTag: string | null = query || null

        for (let tagIndex = 0, tagCount = props.tags.length; tagIndex < tagCount; tagIndex++) {
            const tag = props.tags[tagIndex]
            const tagSlugged = tagsSlugged[tagIndex]

            if (tagSlugged == querySlugged) {
                newTag = null
            }

            if (photoTagsSlugged.indexOf(tagSlugged) !== -1) {
                // This tag is already added -> Don't allow adding twice
                continue
            } else if (tagSlugged == querySlugged) {
                selectableTags.push(tag)
                activeTag = tag
            } else if (!query || tagSlugged.indexOf(querySlugged) !== -1) {
                selectableTags.push(tag)
            }
        }

        if (state.activeTag && selectableTags.indexOf(state.activeTag) !== -1) {
            activeTag = state.activeTag
        } else if (selectableTags.length > 0) {
            activeTag = selectableTags[0]
        } else if (newTag !== null) {
            activeTag = newTag
        } else {
            activeTag = null
        }
        if (newTag !== null) {
            selectableTags.splice(0, 0, newTag)
        }

        return {
            prevQuery: state.query,
            prevTags: props.tags,
            prevPhotoTags: props.photoDetail.tags,
            query,
            tagsSlugged,
            photoTagsSlugged,
            newTag,
            activeTag,
            selectableTags
        }
    }

    constructor(props: Props) {
        super(props)
        this.state = {
            prevQuery: '',
            prevTags: [],
            prevPhotoTags: [],
            query: '',
            tagsSlugged: [],
            photoTagsSlugged: [],
            newTag: null,
            activeTag: null,
            selectableTags: []
        }
        bindMany(this, 'onQueryChange', 'onActiveItemChange', 'onItemSelect', 'onItemRemove', 'renderTag', 'renderMenuItem')
    }

    onQueryChange(query: string) {
        if (query != this.state.query) {
            this.setState({ query })
        }
    }

    onActiveItemChange(activeTag: string | null) {
        if (activeTag != this.state.activeTag) {
            this.setState({ activeTag })
        }
    }

    onItemSelect(tag: string) {
        const props = this.props
        const photoDetail = props.photoDetail
        if (!props.photo || !photoDetail) {
            return
        }

        var selectedTags = [ ...photoDetail.tags, tag ]
        props.setPhotoTags(props.photo, selectedTags)

        this.onQueryChange('')
    }

    onItemRemove(value: string, index: number) {
        const props = this.props
        const photoDetail = props.photoDetail
        if (!props.photo || !photoDetail) {
            return
        }

        var selectedTagIds = [ ...photoDetail.tags ]
        selectedTagIds.splice(index, 1)
        props.setPhotoTags(props.photo, selectedTagIds)
    }

    renderTag(tag: string): string {
        return tag
    }

    renderMenuItem(tag: string, itemProps: IItemRendererProps): JSX.Element {
        return (
            <MenuItem
                key={tag}
                active={itemProps.modifiers.active}
                icon={tag === this.state.newTag ? 'plus' : 'tag'}
                text={tag}
                shouldDismissPopover={false}
                onClick={itemProps.handleClick}
            />
        )
    }

    render() {
        const { props, state } = this
        const isLoading = !props.photo || !props.photoDetail
        return (
            <StringMultiSelect
                className={classNames(props.className, 'TagEditor')}
                tagInputProps={{
                    disabled: isLoading,
                    onRemove: this.onItemRemove,
                    leftIcon: isLoading ? <Spinner size={24}/> : undefined,
                    placeholder: isLoading ? undefined : msg('TagEditor_addTag')
                }}
                query={state.query}
                popoverProps={{ minimal: true }}
                activeItem={state.activeTag}
                items={state.selectableTags}
                selectedItems={props.photoDetail ? props.photoDetail.tags : []}
                noResults={<MenuItem disabled={true} text={msg('TagEditor_error_tagExists')} />}
                tagRenderer={this.renderTag}
                itemRenderer={this.renderMenuItem}
                onQueryChange={this.onQueryChange}
                onActiveItemChange={this.onActiveItemChange}
                onItemSelect={this.onItemSelect}
            />
        )
    }

}

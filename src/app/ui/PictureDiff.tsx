// TODO: Revive Legacy code of 'version' feature
/*

import classNames from 'classnames'
import React from 'react'
import { connect } from 'react-redux'
import { Spinner } from '@blueprintjs/core'

import { Photo, PhotoDetail, Version, ExifOrientation } from 'common/CommonTypes'
import { getNonRawPath } from 'common/util/DataUtil'
import { fileUrlFromPath } from 'common/util/TextUtil'

import { CommandGroupId, addCommandGroup, removeCommandGroup } from 'app/controller/HotkeyController'
import { getPhotoById } from 'app/state/selectors'
import { AppState } from 'app/state/StateTypes'


let rotation = {}

rotation[1] = ''
rotation[8] = 'minus-ninety'


interface OwnProps {
    className?: any
}

interface StateProps {
    photo: Photo
    photoDetail: PhotoDetail
}

interface DispatchProps {
    closeDiff: () => void
}

interface Props extends OwnProps, StateProps, DispatchProps {
}

interface State {
    loaded: boolean
    loadingCount: number
}

export class PictureDiff extends React.Component<Props, State> {

    private commandGroupId: CommandGroupId

    constructor(props: Props) {
        super(props)

        this.onImgLoad = this.onImgLoad.bind(this)

        this.state = {
            loaded: false,
            loadingCount: 0
        }
    }

    componentDidMount() {
        this.commandGroupId = addCommandGroup([
            { combo: 'esc', onAction: this.props.closeDiff },
            { combo: 'd', onAction: this.props.closeDiff },
        ])
    }

    componentWillUnmount() {
        removeCommandGroup(this.commandGroupId)
    }

    onImgLoad() {
        let nextState = { ...this.state }

        nextState.loadingCount++

        if (nextState.loadingCount >= 2) {
            nextState.loaded = true
        }

        this.setState(nextState)
    }

    render() {
        const props = this.props

        const orientation = ExifOrientation.Up  // TODO
        let className = [
            'shadow--2dp',
            rotation[orientation]
        ].join(' ')

        const photoDetail = props.photoDetail
        let last: Version | undefined = undefined
        if (photoDetail) {
            last = photoDetail.versions[photoDetail.versions.length - 1]
        }

        return (
            <div className={classNames(props.className, "picture-diff")}>
                <div className="before v-align">
                    <h3>Before</h3>
                    <img
                        src={fileUrlFromPath(getNonRawPath(props.photo))}
                        onLoad={this.onImgLoad}
                        className={className} />
                </div>

                <div className="after v-align">
                    <h3>After</h3>
                    <img
                        src={last && last.output || undefined}
                        onLoad={this.onImgLoad}
                        className={className} />
                </div>

                {!this.state.loaded &&
                    <Spinner size={Spinner.SIZE_LARGE} />
                }
            </div>
        )
    }
}


const Connected = connect<StateProps, DispatchProps, OwnProps, AppState>(
    (state: AppState, props) => {
        const currentPhoto = state.detail!.currentPhoto
        return {
            ...props,
            photo: getPhotoById(state, currentPhoto.sectionId, currentPhoto.photoId)!,
            photoDetail: state.detail!.currentPhoto.photoDetail!
        }
    },
    {
        closeDiff: () => { throw new Error('Not implemented') }
    }
)(PictureDiff)

export default Connected
*/

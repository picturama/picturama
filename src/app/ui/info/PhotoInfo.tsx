import { clipboard } from 'electron'
import classNames from 'classnames'
import React from 'react'
import { Button, Icon, NonIdealState, Popover, Position, Classes, Menu, MenuItem, MaybeElement } from '@blueprintjs/core'
import moment from 'moment'

import { Photo, ExifData, ExifSegment, allExifSegments } from 'common/CommonTypes'
import { msg, hasMsg } from 'common/i18n/i18n'
import { bindMany } from 'common/util/LangUtil'
import { getMasterPath } from 'common/util/DataUtil'
import { formatNumber } from 'common/util/TextUtil'

import BackgroundClient from 'app/BackgroundClient'
import { InfoPhotoData } from 'app/state/StateTypes'
import { FetchState } from 'app/UITypes'
import MiniWorldMap from 'app/ui/widget/MiniWorldMap'
import Toolbar from 'app/ui/widget/Toolbar'
import FaIcon from 'app/ui/widget/icon/FaIcon'

import TagEditor from './TagEditor'

import './PhotoInfo.less'


const infoIconSize = 24

const exifFilters: { [K in ExifSegment]?: string[] } = {
    // Original from: https://github.com/MikeKovarik/exifr/blob/master/homepage/components.js
    ifd0:      ['ImageWidth', 'ImageHeight', 'Make', 'Model', 'Software'],
	exif:      ['ExposureTime', 'ShutterSpeedValue', 'FNumber', 'ApertureValue', 'ISO', 'LensModel'],
	gps:       ['latitude', 'longitude'],
	interop:   ['InteropIndex', 'InteropVersion'],
	ifd1:      ['ImageWidth', 'ImageHeight', 'ThumbnailLength'],
	iptc:      ['Headline', 'Byline', 'Credit', 'Caption', 'Source', 'Country'],
	icc:       ['ProfileVersion', 'ProfileClass', 'ColorSpaceData', 'ProfileConnectionSpace', 'ProfileFileSignature', 'DeviceManufacturer', 'RenderingIntent', 'ProfileCreator', 'ProfileDescription'],
}

export interface Props {
    style?: any
    className?: any
    isActive: boolean
    photo?: Photo
    photoData?: InfoPhotoData
    tags: string[]
    closeInfo: () => void
    setPhotoTags(photo: Photo, tags: string[]): void
}

interface State {
    showExif: boolean
    showAllOfExifSegment: { [K in ExifSegment]?: true }
}

export default class PhotoInfo extends React.Component<Props, State> {

    constructor(props: Props) {
        super(props)
        bindMany(this, 'showPhotoInFolder', 'copyPhotoPath', 'copyCoordinates', 'toggleExif')
        this.state = {
            showExif: false,
            showAllOfExifSegment: {},
        }
    }

    private showPhotoInFolder() {
        if (this.props.photo) {
            BackgroundClient.showItemInFolder(getMasterPath(this.props.photo))
        }
    }

    private copyPhotoPath() {
        if (this.props.photo) {
            clipboard.writeText(getMasterPath(this.props.photo))
        }
    }

    private copyCoordinates() {
        const coordinates = this.getCoordinates()
        if (coordinates) {
            clipboard.writeText(formatLatLon(coordinates))
        }
    }

    private getCoordinates(): { lat: number, lon: number } | null {
        const exifData = this.props.photoData?.exifData
        if (exifData && exifData.gps && typeof exifData.gps.latitude === 'number' && typeof exifData.gps.longitude === 'number') {
            return { lat: exifData.gps.latitude, lon: exifData.gps.longitude }
        } else {
            return null
        }
    }

    private toggleExif() {
        this.setState({ showExif: !this.state.showExif })
    }

    private toggleShowAllOfExifSegment(segment: ExifSegment) {
        const { showAllOfExifSegment } = this.state
        this.setState({
            showAllOfExifSegment: {
                ...showAllOfExifSegment,
                [segment]: !showAllOfExifSegment[segment]
            }
        })
    }

    render() {
        const { props, state } = this
        const { photo, photoData } = props

        let body: MaybeElement
        if (!props.isActive) {
            body = null
        } else if (photo && photoData) {
            const { metaData } = photoData
            const momentCreated = moment(photo.created_at)
            const coordinates = this.getCoordinates()

            body = (
                <>
                    <div className="PhotoInfo-infoRow">
                        <Icon className="PhotoInfo-infoIcon" icon="calendar" iconSize={infoIconSize} />
                        <div className="PhotoInfo-infoBody">
                            <h1>{momentCreated.format('LL')}</h1>
                            <div className="PhotoInfo-minorInfo">
                                {`${momentCreated.format('dd')}, ${momentCreated.format('LT')} \u00b7 ${momentCreated.fromNow()}`}
                            </div>
                        </div>
                    </div>
                    <div className="PhotoInfo-infoRow">
                        <Icon className="PhotoInfo-infoIcon" icon="media" iconSize={infoIconSize} />
                        <div className="PhotoInfo-infoBody">
                            <h1 className="PhotoInfo-infoTitle hasColumns">
                                <div className="PhotoInfo-shrinkable" title={getMasterPath(photo)}>
                                    {photo.master_filename}
                                </div>
                                <Popover position={Position.BOTTOM_RIGHT}>
                                    <span className={classNames('PhotoInfo-breadcrumbs',  Classes.BREADCRUMBS_COLLAPSED)} />
                                    <Menu>
                                        <MenuItem text={msg('PhotoInfo_showInFolder')} onClick={this.showPhotoInFolder} />
                                        <MenuItem text={msg('PhotoInfo_copyPath')} onClick={this.copyPhotoPath} />
                                    </Menu>
                                </Popover>
                            </h1>
                            <div className="PhotoInfo-minorInfo hasColumns">
                                <div>{formatImageMegaPixel(photo.master_width, photo.master_height)}</div>
                                <div>{`${photo.master_width} \u00d7 ${photo.master_height}`}</div>
                                <div>{renderPhotoSize(photoData)}</div>
                            </div>
                            {(photo.edited_width !== photo.master_width || photo.edited_height !== photo.master_height) &&
                                <div className='PhotoInfo-minorInfo isCentered'>
                                    {`(${photo.edited_width} \u00d7 ${photo.edited_height})`}
                                </div>
                            }
                        </div>
                    </div>
                    {metaData && (metaData.camera || metaData.aperture || metaData.exposureTime || metaData.focalLength || metaData.iso) &&
                        <div className="PhotoInfo-infoRow">
                            <Icon className="PhotoInfo-infoIcon" icon="camera" iconSize={infoIconSize} />
                            <div className="PhotoInfo-infoBody">
                                {metaData.camera &&
                                    <h1>{metaData.camera}</h1>
                                }
                                <div className="PhotoInfo-minorInfo hasColumns">
                                    {metaData.aperture &&
                                        <div>{`\u0192/${metaData.aperture}`}</div>
                                    }
                                    {metaData.exposureTime &&
                                        <div>{formatShutterSpeed(metaData.exposureTime)}</div>
                                    }
                                    {metaData.focalLength &&
                                        <div>{`${metaData.focalLength} mm`}</div>
                                    }
                                    {metaData.iso &&
                                        <div>{`ISO ${metaData.iso}`}</div>
                                    }
                                </div>
                            </div>
                        </div>
                    }
                    <div className="PhotoInfo-infoRow">
                        <FaIcon className="PhotoInfo-infoIcon" name="tags" style={{ fontSize: infoIconSize }} />
                        <TagEditor
                            className="PhotoInfo-tagEditor PhotoInfo-infoBody"
                            photo={props.photo}
                            photoDetail={photoData.photoDetail}
                            tags={props.tags}
                            setPhotoTags={props.setPhotoTags}
                        />
                    </div>
                    {coordinates &&
                        <div className='PhotoInfo-infoRow'>
                            <Icon className='PhotoInfo-infoIcon' icon='map-marker' iconSize={infoIconSize} />
                            <div className='PhotoInfo-infoBody'>
                                <h1 className="PhotoInfo-infoTitle hasColumns">
                                    <div>{formatLatLon(coordinates)}</div>
                                    <Popover position={Position.BOTTOM_RIGHT}>
                                        <span className={classNames('PhotoInfo-breadcrumbs',  Classes.BREADCRUMBS_COLLAPSED)} />
                                        <Menu>
                                            <MenuItem text={msg('PhotoInfo_copyCoordinates')} onClick={this.copyCoordinates} />
                                        </Menu>
                                    </Popover>
                                </h1>
                                <MiniWorldMap
                                    width={215}
                                    pins={[ coordinates ]}
                                />
                            </div>
                        </div>
                    }
                    {photoData.exifData &&
                        <div className='PhotoInfo-infoRow'>
                            <Icon className='PhotoInfo-infoIcon' icon='th' iconSize={infoIconSize} />
                            <div className='PhotoInfo-infoBody'>
                                <h1 className="PhotoInfo-infoTitle hasColumns">
                                    <div>{msg('PhotoInfo_exifData')}</div>
                                    <Button
                                        text={msg(state.showExif ? 'PhotoInfo_hide' : 'PhotoInfo_show')}
                                        onClick={this.toggleExif}
                                    />
                                </h1>
                            </div>
                        </div>
                    }
                    {photoData.exifData && state.showExif &&
                        this.renderExifData(photoData.exifData)
                    }
                </>
            )
        } else {
            // No photo selected
            body = (
                <NonIdealState
                    icon="insert"
                    title={msg('PhotoInfo_noSelection_title')}
                    description={msg('PhotoInfo_noSelection_message')}
                />
            )
        }
    
        return (
            <div className={classNames(props.className, 'PhotoInfo bp3-dark')} style={props.style}>
                <Toolbar className="PhotoInfo-topBar">
                    <span className="PhotoInfo-title">{msg('PhotoInfo_title')}</span>
                    <Toolbar.Spacer/>
                    <Button icon="cross" minimal={true} onClick={props.closeInfo} />
                </Toolbar>
                <div className='PhotoInfo-body'>
                    {body}
                </div>
            </div>
        )
    }

    private renderExifData(exifData: ExifData): JSX.Element {
        return (
            <div className='PhotoInfo-exifData'>
                {allExifSegments.map(exifSegment => {
                    const titleKey = `PhotoInfo_exifTitle_${exifSegment}`
                    const title = hasMsg(titleKey) ? msg(titleKey) : capitalize(exifSegment)
                    const segmentData = exifData[exifSegment]
                    const showAll = !!this.state.showAllOfExifSegment[exifSegment]

                    let body: any
                    if (!segmentData) {
                        body = (
                            <div className='PhotoInfo-noValueMessage'>
                                {msg('PhotoInfo_noValue', title)}
                            </div>
                        )
                    } else if (segmentData instanceof Uint8Array) {
                        body = (
                            <div className='PhotoInfo-exifValue'>
                                {formatByteArray(segmentData, showAll)}
                            </div>
                        )
                    } else {
                        let entries: [string, any][]
                        if (showAll) {
                            entries = Object.entries(segmentData)
                        } else {
                            let filteredKeys = exifFilters[exifSegment] || Object.keys(segmentData).slice(0, 10)
                            entries = filteredKeys.map(key => [ key, segmentData[key] ])
                        }

                        body = entries.map(entry => renderExifEntry(entry, showAll))
                    }

                    return (
                        <div key={exifSegment}>
                            <h1>
                                {title}
                                {segmentData &&
                                    <Button
                                        text={msg(showAll ? 'PhotoInfo_showLess' : 'PhotoInfo_showAll')}
                                        onClick={() => this.toggleShowAllOfExifSegment(exifSegment)}
                                    />
                                }
                            </h1>
                            {body}
                            <div className='PhotoInfo-clear'/>
                        </div>
                    )
                })}
            </div>
        )
    }
    
}


function formatImageMegaPixel(width, height): string {
    const sizeMp = width * height / 1000000
    return `${formatNumber(sizeMp, 1)} MP`
}

function renderPhotoSize(photoData: InfoPhotoData): string | JSX.Element {
    const bytes = photoData.masterFileSize
    if (photoData.fetchState === FetchState.FETCHING) {
        return '...'
    } else if (bytes === null) {
        return (
            <Icon icon='warning-sign' htmlTitle={msg('PhotoInfo_error_fetchPhotoSize')}/>
        )
    } else if (bytes < 1000) {
        return `${bytes} byte`
    } else if (bytes < 1000000) {
        return `${formatNumber(bytes / 1000, 1)} kB`
    } else {
        return `${formatNumber(bytes / 1000000, 1)} MB`
    }
}

function formatShutterSpeed(exposureTime: number): string {
    return '1/' + Math.round(1 / exposureTime)
}

function formatLatLon(latLon: { lat: number, lon: number }): string {
    const options: Intl.NumberFormatOptions = { minimumFractionDigits: 6, maximumFractionDigits: 6 }
    return `${latLon.lat.toLocaleString('en', options)}, ${latLon.lon.toLocaleString('en', options)}`
}

// Original from: https://github.com/MikeKovarik/exifr/blob/master/homepage/util.js
// ISO => ISO
// XMPToolkit => XMP Toolkit
// FNumber => F Number
// AbsoluteAltitude => Absolute Altitude
// FlightRollDegree => Flight Roll Degree
// imageWidth => Image Width
// latitude => Latitude
const matchRegex = /([A-Z]+(?=[A-Z][a-z]))|([A-Z][a-z]+)|([0-9]+)|([a-z]+)|([A-Z]+)/g
function prettyCase(string: string): string {
	return string.match(matchRegex)!.map(capitalize).join(' ')
}

function capitalize(string: string): string {
	return string.charAt(0).toUpperCase() + string.slice(1)
}

function renderExifEntry(entry: [string, any], showAll: boolean): JSX.Element | null {
    const [ key, value ] = entry
    if (value == null) {
        return null
    }

    let formattedValue: string
    if (typeof value === 'string') {
        const stringLimit = 300
        if (showAll || value.length <= stringLimit) {
            formattedValue = value
        } else {
            formattedValue = value.substr(0, stringLimit) + ' ... ' + msg('PhotoInfo_andMore', value.length - stringLimit)
        }
    } else if (value instanceof Uint8Array) {
        formattedValue = formatByteArray(value, showAll)
    } else if (value instanceof Uint16Array || value instanceof Uint32Array) {
        formattedValue = value.join(', ')
    } else {
        formattedValue = JSON.stringify(value)
    }

    return (
        <div key={key} className='PhotoInfo-clear'>
            <span className='PhotoInfo-exifKey'>{prettyCase(key)}</span>
            {' '}
            <span className='PhotoInfo-exifValue'>{formattedValue}</span>
        </div>
    )
}

function formatByteArray(value: Uint8Array, showAll: boolean): string {
    const byteLimit = 60
    let bytes: string[] = []
    for (let i = 0, il = showAll ? value.length : Math.min(byteLimit, value.length); i < il; i++) {
        bytes.push(value[i].toString(16).padStart(2, '0'))
    }
    let formattedValue = bytes.join(' ')
    if (bytes.length < value.length) {
        formattedValue += ' ... ' + msg('PhotoInfo_andMore', value.length - bytes.length)
    }
    return formattedValue
}

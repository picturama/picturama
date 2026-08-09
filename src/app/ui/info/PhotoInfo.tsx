import classNames from 'classnames'
import copyToClipboard from 'copy-text-to-clipboard'
import React from 'react'
import { Button, Icon, NonIdealState, Popover, Position, Classes, Menu, MenuItem, MaybeElement } from '@blueprintjs/core'
import dayjs from 'dayjs'
import { FaTags } from 'react-icons/fa'

import BackgroundClient from 'app/BackgroundClient'
import { Photo, ExifData, ExifSegment, allExifSegments } from 'app/CommonTypes'
import { msg, hasMsg } from 'app/i18n/i18n'
import { InfoPhotoData, InfoPhotoDataState } from 'app/state/StateTypes'
import MiniWorldMap from 'app/ui/widget/MiniWorldMap'
import Toolbar from 'app/ui/widget/Toolbar'
import { bindMany } from 'app/util/LangUtil'
import { getMasterPath } from 'app/util/DataUtil'
import { formatNumber } from 'app/util/TextUtil'

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

// Segments the backend does not parse (yet). A photo may well contain them — we simply don't read
// them — so these get a "not read" message instead of the misleading "photo has no ..." one.
const unreadExifSegments: ExifSegment[] = ['jfif', 'iptc', 'icc']

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
            copyToClipboard(getMasterPath(this.props.photo))
        }
    }

    private copyCoordinates() {
        const coordinates = this.getCoordinates()
        if (coordinates) {
            copyToClipboard(formatLatLon(coordinates))
        }
    }

    private getCoordinates(): { lat: number, lon: number } | null {
        const { photoData } = this.props
        const exifData = (photoData?.state === InfoPhotoDataState.Loaded) && photoData.exifData
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
            const metaData = (photoData.state === InfoPhotoDataState.Loaded) ? photoData.metaData : null
            const dayjsCreated = dayjs(photo.createdAt)
            const coordinates = this.getCoordinates()

            body = (
                <>
                    {(photoData.state === InfoPhotoDataState.MasterIsMissing) &&
                        <div className='PhotoInfo-infoRow'>
                            <Icon className='PhotoInfo-infoIcon' icon='delete' size={infoIconSize} />
                            <div className='PhotoInfo-infoBody'>
                                <h1>{msg('common_error_photoNotExisting')}</h1>
                                <div className='PhotoInfo-minorInfo'>{msg('common_error_photoNotExisting_desc')}</div>
                            </div>
                        </div>
                    }
                    <div className="PhotoInfo-infoRow">
                        <Icon className="PhotoInfo-infoIcon" icon="calendar" size={infoIconSize} />
                        <div className="PhotoInfo-infoBody">
                            <h1>{dayjsCreated.format('LL')}</h1>
                            <div className="PhotoInfo-minorInfo">
                                {`${dayjsCreated.format('dd')}, ${dayjsCreated.format('LT')} \u00b7 ${dayjsCreated.fromNow()}`}
                            </div>
                        </div>
                    </div>
                    <div className="PhotoInfo-infoRow">
                        <Icon className="PhotoInfo-infoIcon" icon="media" size={infoIconSize} />
                        <div className="PhotoInfo-infoBody">
                            <h1 className="PhotoInfo-infoTitle hasColumns">
                                <div className="PhotoInfo-shrinkable" title={getMasterPath(photo)}>
                                    {photo.masterFilename}
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
                                <div>{formatImageMegaPixel(photo.masterWidth, photo.masterHeight)}</div>
                                <div>{`${photo.masterWidth} \u00d7 ${photo.masterHeight}`}</div>
                                <div>{renderPhotoSize(photoData)}</div>
                            </div>
                            {(photo.editedWidth !== photo.masterWidth || photo.editedHeight !== photo.masterHeight) &&
                                <div className='PhotoInfo-minorInfo isCentered'>
                                    {`(${photo.editedWidth} \u00d7 ${photo.editedHeight})`}
                                </div>
                            }
                        </div>
                    </div>
                    {metaData && (metaData.camera || metaData.aperture || metaData.exposureTime || metaData.focalLength || metaData.iso) &&
                        <div className="PhotoInfo-infoRow">
                            <Icon className="PhotoInfo-infoIcon" icon="camera" size={infoIconSize} />
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
                    {(photoData.state === InfoPhotoDataState.Loaded || photoData.state === InfoPhotoDataState.Loading) &&
                        <div className="PhotoInfo-infoRow">
                            <FaTags className="PhotoInfo-infoIcon" style={{ fontSize: infoIconSize }} />
                            <TagEditor
                                className="PhotoInfo-tagEditor PhotoInfo-infoBody"
                                photo={props.photo}
                                photoDetail={photoData.state === InfoPhotoDataState.Loaded ? photoData.photoDetail : null}
                                tags={props.tags}
                                setPhotoTags={props.setPhotoTags}
                            />
                        </div>
                    }
                    {coordinates &&
                        <div className='PhotoInfo-infoRow'>
                            <Icon className='PhotoInfo-infoIcon' icon='map-marker' size={infoIconSize} />
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
                    {(photoData.state === InfoPhotoDataState.Loaded) && photoData.exifData &&
                        <div className='PhotoInfo-infoRow'>
                            <Icon className='PhotoInfo-infoIcon' icon='th' size={infoIconSize} />
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
                    {(photoData.state === InfoPhotoDataState.Loaded) && photoData.exifData && state.showExif &&
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
                <Toolbar className="PhotoInfo-topBar" isTopBar>
                    <span className="PhotoInfo-title">{msg('PhotoInfo_title')}</span>
                    <Toolbar.Spacer isTopBar/>
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
                        const noValueKey = unreadExifSegments.indexOf(exifSegment) !== -1
                            ? 'PhotoInfo_segmentNotRead' : 'PhotoInfo_noValue'
                        body = (
                            <div className='PhotoInfo-noValueMessage'>
                                {msg(noValueKey, title)}
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

function renderPhotoSize(photoData: InfoPhotoData): string | JSX.Element {
    switch (photoData.state) {
        case InfoPhotoDataState.Loading:
            return '...'
        case InfoPhotoDataState.MasterIsMissing:
            return '-'
        case InfoPhotoDataState.Error:
            return (
                <Icon icon='warning-sign' htmlTitle={msg('PhotoInfo_error_fetchPhotoSize')}/>
            )
        default:
            const bytes = photoData.masterFileSize
            if (bytes < 1000) {
                return `${bytes} byte`
            } else if (bytes < 1000000) {
                return `${formatNumber(bytes / 1000, 1)} kB`
            } else {
                return `${formatNumber(bytes / 1000000, 1)} MB`
            }
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

// EXIF/XMP timestamps arrive as ISO-8601 strings (e.g. "2019-09-12T18:22:17", possibly with a
// timezone). Detect a full date+time and render it in the active locale via dayjs; any other string
// (including date-only values) is left untouched.
const isoDateTimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
function formatExifDateTime(value: string): string | null {
    if (!isoDateTimeRegex.test(value)) {
        return null
    }
    const parsed = dayjs(value)
    return parsed.isValid() ? parsed.format('L LT') : null
}

function renderExifEntry(entry: [string, any], showAll: boolean): JSX.Element | null {
    const [ key, value ] = entry
    if (value == null) {
        return null
    }

    let formattedValue: string
    if (typeof value === 'string') {
        const stringLimit = 300
        const formattedDate = formatExifDateTime(value)
        if (formattedDate !== null) {
            formattedValue = formattedDate
        } else if (showAll || value.length <= stringLimit) {
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

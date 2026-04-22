import npmPackage from '../../package.json'

import { PhotoRenderFormat } from 'common/CommonTypes'


//let picturamaAppDir: string
//let anselHomeDir: string
//let picturamaHomeDir: string
//if (process.env.PICTURAMA_DEV_MODE) {
//    const cwd = process.cwd()
//    picturamaAppDir = `${cwd}`
//    anselHomeDir = `${cwd}/dot-ansel`
//    picturamaHomeDir = `${cwd}/dot-picturama`
//} else {
//    picturamaAppDir = `${process.resourcesPath}/app`
//    anselHomeDir = `${os.homedir()}/.ansel`
//    picturamaHomeDir = `${os.homedir()}/.picturama`
//}

//const platform = os.platform()

export default {
    version: npmPackage.version,
    //platform,
    acceptedRawExtensions: [ 'raf', 'cr2', 'arw', 'dng' ],
    acceptedHeicExtensions: [ 'heic', 'heif' ],
    acceptedNonRawExtensions: [ 'png', 'jpg', 'jpeg', 'tif', 'tiff', 'webp' ],
    watchedFormats: /([$#\w\d]+)-([$#\w\dèé]+)-(\d+)\.(JPEG|JPG|PNG|PPM|TIFF|WEBP)/i,
    workExt: 'webp' as  PhotoRenderFormat,
    /** The home directory of version 1.0.0 and before (where Picturama's name was Ansel) */
    //anselHomeDir,
    //picturamaHomeDir,
    //keymapsFolder: `${picturamaAppDir}/keymaps`,
    //dbFile: `${picturamaHomeDir}/db.sqlite3`,
    //dbMigrationsFolder: `${picturamaAppDir}/migrations`,
    //settings: `${picturamaHomeDir}/settings.json`,
    //nonRawPath: `${picturamaHomeDir}/non-raw`,
    //thumbnailPath: `${picturamaHomeDir}/thumbnails`,
    //tmp: `${os.tmpdir()}/picturama`,
    concurrency: 3,

    // TODO: Revive Legacy code of 'version' feature
    /*
    editors: [
        {
            name: 'Gimp',
            cmd: 'gimp',
            format: 'JPG',
            platforms: [ 'darwin', 'linux' ]
        },
        {
            name: 'Rawtherapee',
            cmd: 'rawtherapee',
            format: 'RAW',
            platforms: [ 'darwin', 'linux' ]
        },
        {
            name: 'Darktable',
            cmd: 'darktable',
            format: 'RAW',
            platforms: [ 'darwin', 'linux' ]
        }
    ]
    */
}

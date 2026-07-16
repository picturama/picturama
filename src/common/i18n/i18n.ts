import moment from 'moment'  // This includes locale 'en'
import 'moment/locale/cs'
import 'moment/locale/de'
import 'moment/locale/es'
import 'moment/locale/fr'
import 'moment/locale/ru'
import 'moment/locale/zh-cn'
import 'moment/locale/zh-hk'
import 'moment/locale/zh-mo'
import 'moment/locale/zh-tw'

import text_cs from './text_cs'
import text_de from './text_de'
import text_en from './text_en'
import text_es from './text_es'
import text_fr from './text_fr'
import text_ru from './text_ru'
import text_zh from './text_zh'


export type Locale = 'cs' | 'de' | 'en' | 'es' | 'fr' | 'ru' | 'zh'
export const locales = [ 'cs', 'de', 'en', 'es', 'fr', 'ru', 'zh' ]

export const fallbackLocale: Locale = 'en'
export type I18nKey = keyof typeof text_en

const textsByLang: { [K in Locale]: { [K in I18nKey]?: string } } = {
    cs: text_cs,
    de: text_de,
    en: text_en,
    es: text_es,
    fr: text_fr,
    ru: text_ru,
    zh: text_zh,
}

const msgFormatRe = /\{(\d+)\}/g
const msgSplitRe = /(\{\d+\})/g


let locale: Locale

export function setLocale(newLocale: string) {
    if (newLocale.length > 2) {
        newLocale = newLocale.substr(0, 2)
    }
    if (locales.indexOf(newLocale) === -1) {
        newLocale = fallbackLocale
    }

    locale = newLocale as Locale
    moment.locale(locale)
}

export function getLocale(): string {
    return locale
}

export function msg(key: I18nKey, ...args: any[]): string {
    if (!locale) {
        throw new Error('msg was called before locale was set')
    }

    let text: string | undefined = textsByLang[locale][key]
    if (!text) {
        console.error(`Missing I18N key for ${locale}: ${key}`)
        text = textsByLang[fallbackLocale][key]
        if (!text) {
            return `[${key}]`
        }
    }

    if (args && args.length > 0) {
        return text.replace(msgFormatRe, (match, group1) => args[parseInt(group1)])
    } else {
        return text
    }
}

export function hasMsg(key: string): key is I18nKey {
    if (!locale) {
        throw new Error('msg was called before locale was set')
    }
    return !!textsByLang[locale][key]
}

export function splitMsg(key: I18nKey): string[] {
    return msg(key).split(msgSplitRe)
}

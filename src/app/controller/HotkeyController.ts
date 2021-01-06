// Controls hotkeys
//
// The API and implementation is inspired by [blueprint's hotkeys](https://blueprintjs.com/docs/#core/components/hotkeys),
// which we can't use because of [a bug](https://github.com/palantir/blueprint/issues/2972).
// This API however uses a less "pseodo-react" approach.


import { IKeyCombo, getKeyCombo, getKeyComboString, comboMatches, parseKeyCombo } from '@blueprintjs/core'

import { msg } from 'common/i18n/i18n'
import { assertRendererProcess } from 'common/util/ElectronUtil'

import { setShiftPressedAction } from 'app/state/actions'
import store from 'app/state/store'


assertRendererProcess()


export interface Command {
    /** Hotkey combination string, such as "space" or "cmd+n". */
    combo: string
    /** The parsed hotkey combination (will be set by HotkeyController) */
    parsedCombo?: IKeyCombo
    /** Whether the hotkey can be triggered. (default: `true`) */
    enabled?: boolean | (() => boolean)
    /** Human-friendly label for the hotkey. */
    label?: string
    /** event handler. */
    onAction: () => void
}


export type CommandGroupId = number


interface CommandGroup {
    groupId: CommandGroupId
    commands: Command[]
    enabled: boolean
}


let nextGroupId: CommandGroupId = 1
let groups: { [K in CommandGroupId]: CommandGroup } = {}

let isInitialized = false
let prevIsShiftPressed: boolean | null = null


export function addCommandGroup(commands: Command[] | { [K in any]: Command }): CommandGroupId {
    if (!Array.isArray(commands)) {
        commands = Object.values(commands)
    }

    const groupId = nextGroupId++
    groups[groupId] = { groupId, commands, enabled: true }

    if (!isInitialized) {
        isInitialized = true
        window.addEventListener('keydown', onGlobalKeyDown)
        window.addEventListener('keyup', onGlobalKeyUp)
    }

    return groupId
}

export function removeCommandGroup(groupId: CommandGroupId) {
    delete groups[groupId]
}

export function setCommandGroupEnabled(groupId: CommandGroupId, enabled: boolean) {
    const group = groups[groupId]
    if (group) {
        group.enabled = enabled
    }
}

export function isCommandEnabled(command: Command): boolean {
    const commandEnabled = command.enabled
    return (typeof commandEnabled === 'function') ? commandEnabled() : commandEnabled !== false
}

export function getCommandLabel(command: Command): string {
    return formatCommandLabel(command.label, command.combo)
}

export function formatCommandLabel(label: string | null | undefined, combo: string): string {
    const formattedCombo = formatCombo(combo)
    return label ? `${label} ${formattedCombo}` : formattedCombo
}

export function formatCombo(combo: string): string {
    switch (combo) {
        case 'left': combo = '\u21E6'; break
        case 'right': combo = '\u21E8'; break
        case 'enter': combo = '\u23CE'; break
        case 'space':
            combo = msg(`key_${combo}` as any)
            break;
    }
    return `[${combo}]`
}

export function getCommandButtonProps(command: Command): { disabled: boolean, title: string, onClick: () => void } {
    return {
        disabled: !isCommandEnabled(command),
        title: getCommandLabel(command),
        onClick: command.onAction
    }
}


function onGlobalKeyDown(event: KeyboardEvent) {
    updateShiftPressed(event)

    if (isTextInput(event)) {
        return
    }

    const combo = getKeyCombo(event)
    for (const groupId in groups) {
        const group = groups[groupId]
        if (group.enabled) {
            for (const command of group.commands) {
                if (!command.parsedCombo) {
                    command.parsedCombo = parseKeyCombo(command.combo)
                }
                if (comboMatches(combo, command.parsedCombo) && isCommandEnabled(command)) {
                    try {
                        event.preventDefault()
                        command.onAction()
                    } catch (error) {
                        console.error(`Handling hotkey ${getKeyComboString(event)} failed` +
                            (command.label ? ` for handler ${command.label}` : ''),
                            error)
                    }
                    return
                }
            }
        }
    }
}


function onGlobalKeyUp(event: KeyboardEvent) {
    updateShiftPressed(event)
}


function updateShiftPressed(event: KeyboardEvent) {
    if (event.shiftKey !== prevIsShiftPressed) {
        prevIsShiftPressed = event.shiftKey
        store.dispatch(setShiftPressedAction(prevIsShiftPressed))
    }
}


function isTextInput(event: KeyboardEvent) {
    // Original code from: node_modules/@blueprintjs/core/src/components/hotkeys/hotkeysEvents.ts

    const elem = event.target as HTMLElement
    // we check these cases for unit testing, but this should not happen
    // during normal operation
    if (elem == null || elem.closest == null) {
        return false
    }

    const editable = elem.closest("input, textarea, [contenteditable=true]")

    if (editable == null) {
        return false
    }

    // don't let checkboxes, switches, and radio buttons prevent hotkey behavior
    if (editable.tagName.toLowerCase() === "input") {
        const inputType = (editable as HTMLInputElement).type
        if (inputType === "checkbox" || inputType === "radio") {
            return false
        }
    }

    // don't let read-only fields prevent hotkey behavior
    if ((editable as HTMLInputElement).readOnly) {
        return false
    }

    return true
}

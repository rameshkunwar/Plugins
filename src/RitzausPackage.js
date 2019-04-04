import './scss/index.scss'
import {RitzausComponent} from './RitzausComponent'

export default {
    name: 'RitzausNyheder', // TODO: Change "npwriterdevkit" to your plugin name
    id: 'dk.ritzaus.nyhder', // TODO: Change this id to you id
    // name: 'OurPlugin', // TODO: Change "npwriterdevkit" to your plugin name
    // id: 'se.infomaker.npwriterdevkit', // TODO: Change this id to you id
    title: 'Ritzaus Nyheder',
    description: 'Nyhedstjenese feed',
    version: 'dev',
    organization: 'Ritzaus Bureau',
    tags: [],

    // The configure() is called by the writer when it wants the
    // plugin to initalize itself and its different parts.
    configure: function(config, pluginConfig) {

        // Add plugin to main sidebar (can be overriden in plugin config)
        config.addToSidebar('Ritzaus Nyheder', pluginConfig, RitzausComponent)

        // Add translations for the plugin
        config.addLabel('Ritzaus Nyhedstjeneste plugin loaded', {
            en: 'Ritzaus Nyhedstjeneste plugin loaded',
            dk: 'Ritzaus Nyhedstjeneste plugin inlæst'
        })

        // config.addLabel('Click me', {
        //     en: 'Click me',
        //     sv: 'Klik her'
        // })

        // config.addLabel('Number of clicks', {
        //     en: 'Number of clicks',
        //     sv: 'Antallet af klik'
        // })
    }
}

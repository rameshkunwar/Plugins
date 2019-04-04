import RitzausPackage from './RitzausPackage'
import {registerPlugin} from 'writer'

(() => {
    // Register the plugin with the Writer when registerPlugin() is available
    if(registerPlugin) {
        registerPlugin(RitzausPackage)
    }
    else {
        console.error('Register method not yet available');
        console.log('some error');
    }
})()

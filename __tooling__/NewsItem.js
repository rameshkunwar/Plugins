import jxon from '@infomaker/im-jxon'
import omit from 'lodash/omit'
import startsWith from 'lodash/startsWith'
import replace from 'lodash/replace'

import isObject from 'lodash/isObject'
import isArray from 'lodash/isArray'
import Event from '../utils/Event'

import NotFoundError from '../utils/errors/NotFoundError'

import nilUUID from '../utils/NilUUID'

/**
 * @ignore
 */
jxon.config({
    autoDate: false,
    parseValues: false,
    lowerCaseTags: false,
    trueIsEmpty: false,
    valueKey: 'keyValue',
    attrPrefix: '@'
})

/**
 * @ignore
 */
const extractNodeInfo = function(tagLinkNode) {

    if (!tagLinkNode || !tagLinkNode.getAttribute) {
        return {}
    }

    return {
        uuid: tagLinkNode.getAttribute('uuid'),
        title: tagLinkNode.getAttribute('title'),
        rel: tagLinkNode.getAttribute('rel'),
        type: tagLinkNode.getAttribute('type')
    }
}

/**
 * News item manipulation methods
 *
 * @class
 * @alias api.newsitem
 */
class NewsItem {
    /** @hideconstructor */
    constructor(api) {
        this.api = api
    }


    /**
     * Save news item. Triggers a validation of the news item.
     */
    save() {
        // Look for dirty file nodes (ie files being uploaded which does not yet have uuid etc)
        const proxies = this.api.editorSession.fileManager.proxies
        let dirtyNodes = 0

        Object.keys(proxies).forEach(key => {
            const node = proxies[key].fileNode

            if (!this.api.editorSession.getDocument().get(node.parentNodeId)) {
                // If this proxy refers to a node long gone from the document (garbage)
                return
            }

            if (node.uuid) {
                return
            }

            dirtyNodes++
        })

        if (!this.api.browser.isSupported()) {
            this.api.ui.showNotification(
                'save',
                this.api.getLabel('Error!'),
                this.api.getLabel('Browser not supported, article was not saved.')
            )

            setTimeout(() => {
                this.api.events.userActionCancelSave()
            }, 1)

            return
        }

        if (dirtyNodes > 0) {
            this.api.ui.showNotification(
                'save',
                this.api.getLabel('Article not saved!'),
                this.api.getLabel('Please wait until images are uploaded before saving.')
            )

            setTimeout(() => {
                this.api.events.userActionCancelSave()
            }, 1)

            return
        }

        this.api.editorSession.saveHandler.saveDocument()
    }

    getSource() {
        var exporter = this.api.configurator.createExporter('newsml', {
            api: this.api
        })
        return exporter.exportDocument(this.api.editorSession.getDocument(), this.api.newsItemArticle);
    }

    /**
     * Set the NewsML source. Will effectively replace the current article with
     * anything in the incoming NewsML. Should normally always be followed by sending
     * Event.DOCUMENT_CHANGED event as this is not done automatically.
     *
     * @param {string} newsML The NewsML source
     * @param {object} writerConfig Optional, explicit writer config used internally only, should be empty.
     * @param {string} etag An etag for the NewsML source
     *
     * @return {object | null}
     */
    setSource(newsML, writerConfig, etag) {
        var newsMLImporter = this.api.configurator.createImporter('newsml', {
            api: this.api
        })

        var parser = new DOMParser();
        var newsItemArticle = parser.parseFromString(newsML, "application/xml"),
            idfDocument = newsMLImporter.importDocument(newsML);

        if (writerConfig) {
            return {
                newsItemArticle: newsItemArticle,
                idfDocument: idfDocument
            };
        }

        this.api.newsItemArticle = newsItemArticle;
        this.api.doc = idfDocument;

        // Set etag in router
        if (etag) {
            console.info('Setting etag', etag, 'for uuid', this.getGuid(), 'in route')
            this.api.router.setEtag(this.getGuid(), etag)
        }

        this.api.app.replaceDoc({
            newsItemArticle: newsItemArticle,
            idfDocument: idfDocument
        })
    }


    /**
     * Return the GUID in the NewsItemArticle
     * Can return null if no GUID is found in NewsItem
     *
     * @returns {guid|null}
     */
    getGuid() {
        return this.api.newsItemArticle.documentElement.getAttribute('guid')
    }

    /**
     * Set news item guid (uuid)
     *
     * @param {String} New uuid or null to clear
     */
    setGuid(uuid) {
        this.api.newsItemArticle.documentElement.setAttribute(
            'guid',
            uuid || ''
        )
    }


    /*
     <?xml version="1.0" encoding="UTF-8"?><newsItem xmlns="http://iptc.org/std/nar/2006-10-01/" conformance="power" guid="2e6cd937-f366-4b5c-8b4a-fd2cc38245b1" standard="NewsML-G2" standardversion="2.20" version="1">
     <catalogRef href="http://www.iptc.org/std/catalog/catalog.IPTC-G2-Standards_27.xml"/>
     <catalogRef href="http://infomaker.se/spec/catalog/catalog.infomaker.g2.1_0.xml"/>
     <itemMeta>
     <itemClass qcode="ninat:text"/>
     <provider literal="testdata-1.0"/>
     <versionCreated>2016-03-03T16:09:55+01:00</versionCreated>
     <firstCreated>2016-03-03T16:09:55+01:00</firstCreated>
     <pubStatus qcode="stat:usable"/>
     <service qcode="imchn:sydsvenskan"/>
     <service qcode="imchn:hd"/>
     <title>Ola testar torsdag</title>
     <itemMetaExtProperty type="imext:uri" value="im://article/2e6cd937-f366-4b5c-8b4a-fd2cc38245b1"/>
     */

    removeDocumentURI() {
        var node = this.api.newsItemArticle.querySelector('itemMeta > itemMetaExtProperty[type="imext:uri"]');
        if (node) {
            node.parentNode.removeChild(node);
        }
    }

    /**
     * Gets locale from article's idf-element. Formatted with underscore, eg. sv_SE, en_GB, nl_NL.
     * Uses fallback languages if the article's language only uses two characters.
     * If fallback fails, will return the configured "language"-property from writer-config.
     *
     * @return {string}
     */
    getLocale() {
        const {type, subtype} = this.getLanguageParts()

        if(type && subtype) {
            return `${type}_${subtype}`
        }

        return this.api.configurator.getLocaleForLanguage(type)
    }

    /**
     * Gets a language parts object parsed from article's NewsML.
     *
     * @return {{type: string, subtype: string, direction: string}}
     */
    getLanguageParts() {
        const node = this.api.newsItemArticle.querySelector('contentSet > inlineXML > idf');
        const [type, subtype] = node.getAttribute('xml:lang').split('-')
        const direction = node.getAttribute('dir')

        return {
            type,
            subtype,
            direction
        }
    }

    /**
     * Sets xml:lang property on article's idf-element. Language code should be two two-character codes separated
     * by a dash, eg. sv-SE, en-GB
     *
     * @param {string} name Plugin-id that set language
     * @param {string} languageCode Two two-character language-region codes, separated by a dash. eg. sv-SE, en-GB, nl-NL
     * @param {string} textDirection
     */
    setLanguage(name, languageCode, textDirection = 'ltr') {

        // Just in case someone sends the code using the other, almost correct, xx_YY format.
        const sanitizedLanguageCode = languageCode.replace('_', '-')

        const node = this.api.newsItemArticle.querySelector('contentSet > inlineXML > idf')
        node.setAttribute('xml:lang', sanitizedLanguageCode)
        node.setAttribute('dir', textDirection)

        this.api.events.documentChanged(
            name,
            {
                type: 'language',
                action: 'update',
                data: {}
            }
        )
        this.api.events.languageChanged({
            languageCode,
            textDirection
        })
    }

    getTextDirection() {
        const {direction} = this.getLanguageParts()

        return direction || this.api.editorSession.getTextDirection()
    }

    /**
     * Get news priority.
     *
     * @return {Object} News priority object in JXON format
     */
    getNewsPriority() {
        var node = this.api.newsItemArticle.querySelector(
            'contentMeta metadata object[type="x-im/newsvalue"]');
        if (!node) {
            console.warn('News Priority not found in document');
            return null;
        }

        return jxon.build(node);
    }


    /**
     * Create and insert a new newsPriority object into the news item content meta data.
     * Triggers a documentChanged event to all documentChanged listeners except
     * the plugin making the change.
     *
     * @param {string} name Plugin name
     * @param {object} newsPriority
     *
     * @fires event.DOCUMENT_CHANGED
     */
    createNewsPriority(name, newsPriority) {

        var metaDataNode = this.api.newsItemArticle.querySelector('contentMeta metadata'),
            newsValueNode = jxon.unbuild(newsPriority, metaDataNode.namespaceURI, 'object');

        if (!metaDataNode) {
            var contentMetaNode = this.api.newsItemArticle.querySelector('contentMeta');
            metaDataNode = this.api.newsItemArticle.createElementNS(contentMetaNode.namespaceURI, 'metadata');
            contentMetaNode.appendChild(metaDataNode);
        }

        metaDataNode.appendChild(newsValueNode.childNodes[0]);

        this.api.events.documentChanged(
            name,
            {
                type: 'newsPriority',
                action: 'add',
                data: this.getNewsPriority(name)
            }
        );
    }


    /**
     * Set news priority.
     *
     * @fixme jxon.unbuild() creates object elements from empty strings which is WRONG
     *
     * @todo Validate in data format object.data.links etc
     * @todo Break out metaDataNode check so more functions can use it
     *
     * @param {string} name Name of the plugin making the call
     * @param {Object} newsPriority News priority object
     *
     * @fires event.DOCUMENT_CHANGED
     */
    setNewsPriority(name, newsPriority) {
        if ('undefined' === typeof newsPriority) {
            throw new Error('Undefined value');
        }

        var metaDataNode = this.api.newsItemArticle.querySelector('contentMeta metadata'),
            newsValueNode = this.api.newsItemArticle.querySelector(
                'contentMeta metadata object[type="x-im/newsvalue"]');

        if (!metaDataNode) {
            var contentMetaNode = this.api.newsItemArticle.querySelector('contentMeta');
            metaDataNode = this.api.newsItemArticle.createElementNS(contentMetaNode.namespaceURI, 'metadata');
            contentMetaNode.appendChild(metaDataNode);
        }
        else if (newsValueNode) {
            metaDataNode.removeChild(newsValueNode);
        }

        newsValueNode = jxon.unbuild(newsPriority, metaDataNode.namespaceURI, 'object');
        metaDataNode.appendChild(newsValueNode.childNodes[0]);

        this.api.events.documentChanged(
            name,
            {
                type: 'newsPriority',
                action: 'update',
                data: this.getNewsPriority(name)
            }
        );
    }

    /**
     * Get main channel (channel with attribute why="imext:main")
     *
     * @returns {object}
     */
    getMainChannel() {
        var obj = null,
            node = this.api.newsItemArticle.querySelector('itemMeta service[why="imext:main"]');

        if (node) {
            obj = jxon.build(node);
            obj['qcode'] = obj['@qcode'];
            delete obj['@qcode'];
        }

        return obj;
    }

    /**
     * Get Sections.
     * Finds all the service nodes with a qCode containing imsection:
     *
     * Renames @qcode to qcode so plugins doesn't have to handle
     *
     * @returns {Array}
     * @return {*}
     */
    getSections() {
        return this._getServices('imsection')
    }

    /**
     * Get Section.
     *
     * Find section on article if any. If no section null is returned.
     * Note that by using this function it is presumed that there can
     * be max one section on an article.
     *
     * @return {*}
     */
    getSection() {
        let sections = this.getSections()

        if (sections.length > 1) {
            throw new Error('Only one section is allowed on an article');
        } else if (sections.length === 1) {
            return sections[0]
        } else {
            return null;
        }
    }

    /**
     * Get Channels
     * Finds all the service nodes with a qCode containing imchn:
     *
     * Renames @qcode to qcode so plugins doesn't have to handle
     *
     * @returns {Array}
     */
    getChannels() {

        // TODO: Use internal _getServices('imchn')...
        var nodes = this.api.newsItemArticle.querySelectorAll('itemMeta service[qcode]');
        if (!nodes) {
            console.warn('No services with qcode found');
            return [{}];
        }

        var wrapper = [];
        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i],
                qCode = node.getAttribute('qcode');

            if (qCode.indexOf('imchn') >= 0) {
                var json = jxon.build(node);

                json['qcode'] = json['@qcode'];
                delete json['@qcode'];

                wrapper.push(json);
            }
        }

        return wrapper;
    }

    getNormalizedChannels() {
        var linkNodes = this.api.newsItemArticle.querySelectorAll(`itemMeta > links > link[type="x-im/channel"][rel="channel"]`)

        if (!linkNodes) {
            return null;
        }

        var links = [];
        var length = linkNodes.length;
        for (var i = 0; i < length; i++) {
            var link = jxon.build(linkNodes[i]);
            var normalizedTag = this.normalizeObject(link);
            links.push(normalizedTag);
        }

        return links;
    }

    /**
     * Get Services.
     * Finds all the service nodes with a qCode containing qcode prefix sent in as parameter:
     *
     * Renames @qcode to qcode so plugins doesn't have to handle
     *
     * @qcodePrefix QCode prefix to look for in service elements.
     *
     * @private
     * @returns {Array}
     * @return {*}
     */
    _getServices(qcodePrefix) {
        const nodes = this.api.newsItemArticle.querySelectorAll('itemMeta service[qcode]')
        if (!nodes) {
            console.warn('No services with qcode found')
            return [{}]
        }

        let wrapper = []
        for (let i = 0; i < nodes.length; i++) {
            let node = nodes[i],
                qCode = node.getAttribute('qcode'),
                pubConstraint = node.getAttribute('pubconstraint')

            // Attribute "qcode" mandatory
            if (qCode.indexOf(qcodePrefix) >= 0) {
                let json = jxon.build(node);

                json['qcode'] = json['@qcode'];
                delete json['@qcode'];

                // Optional attribute
                if (pubConstraint) {
                    json['pubconstraint'] = json['@pubconstraint']
                    delete json['@pubconstraint']
                }

                wrapper.push(json);
            }
        }

        return wrapper;
    }

    /**
     * Update Section.
     * Removes existing section and add new. Note expects article to only allow
     * one section.
     * @param name Name of plugin.
     * @param section Section object to set on article.
     *
     * @fires event.DOCUMENT_CHANGED
     * @throws Error
     */
    updateSection(name, section) {
        if (!isObject(section)) {
            throw new Error('There can be only one section')
        }

        // Remove existing section if any
        let currentSection = this.getSection()
        if (currentSection) {
            this.removeSection(name, currentSection)
        }

        // Update section
        let itemMetaNode = this.api.newsItemArticle.querySelector('itemMeta'),
            service = {},
            serviceNode

        // Create service element
        service['@qcode'] = section.qcode

        // If product parent exists set attribute to reflect this
        if (section.product) {
            service['@pubconstraint'] = section.product
        }

        service.name = section.name
        serviceNode = jxon.unbuild(service, itemMetaNode.namespaceURI, 'service');

        // Add service to itemMeta element
        itemMetaNode.appendChild(serviceNode.childNodes[0]);

        this.api.events.documentChanged(
            name,
            {
                type: 'section',
                action: 'update',
                data: section
            }
        );
    }

    /**
     * Removes <service>.
     *
     * @param {string} name Name of plugin.
     * @param {string} section Section object to remove.
     * @param {boolean} muteEvent Optional. Mute event if set to true, only used internally.
     *
     * @fires event.DOCUMENT_CHANGED
     * @throws Error
     */
    removeSection(name, section, muteEvent) {
        let query = 'itemMeta service[qcode="' + section['qcode'] + '"]'
        let service = this.api.newsItemArticle.querySelector(query);

        if (!service) {
            // Silently ignore request
            return;
        }

        service.parentElement.removeChild(service);

        if (muteEvent === true) {
            return;
        }

        this.api.events.documentChanged(
            name,
            {
                type: 'section',
                action: 'delete',
                data: section
            }
        );
    }

    /**
     * Add a channel as a <service>.
     * Renaming qcode to @qcode.
     *
     * @param {string} name Name of plugin
     * @param {string} channel Name of channel
     * @param {boolean} setAsMainChannel Set this channel as main channel
     *
     * @fires event.DOCUMENT_CHANGED
     * @throws Error
     */
    addChannel(name, channel, setAsMainChannel) {
        if (!isObject(channel)) {
            throw new Error('addChannel only supports adding one channel at a time');
        }

        var currentChannels = this.getChannels(),
            itemMetaNode = this.api.newsItemArticle.querySelector('itemMeta'),
            service = {};

        if (currentChannels.some(currentChannel => channel.qcode === currentChannel['qcode'])) {
            this.removeChannel(name, channel);
        }

        service['@qcode'] = channel.qcode;

        var mainNodes = this.api.newsItemArticle.querySelectorAll('itemMeta > service[why="imext:main"]');
        if (setAsMainChannel) {
            service['@why'] = 'imext:main';

            for (var n = 0; n < mainNodes.length; n++) {
                mainNodes[n].removeAttribute('why');
            }
        }

        var serviceNode = jxon.unbuild(service, itemMetaNode.namespaceURI, 'service');
        itemMetaNode.appendChild(serviceNode.childNodes[0]);

        this.api.events.documentChanged(
            name,
            {
                type: 'channel',
                action: 'add',
                data: channel
            }
        );
    }


    /**
     * Removes <service>.
     *
     * @param {string} name Name of plugin
     * @param {string} channel Name of channel
     * @param {boolean} muteEvent Optional. Mute event if set to true, only used internally.
     *
     * @fires event.DOCUMENT_CHANGED
     * @throws Error
     */
    removeChannel(name, channel, muteEvent) {
        var query = 'itemMeta service[qcode="' + channel['qcode'] + '"]';
        var service = this.api.newsItemArticle.querySelector(query);

        if (!service) {
            // Silently ignore request
            return;
        }

        service.parentElement.removeChild(service);

        if (muteEvent === true) {
            return;
        }

        this.api.events.documentChanged(
            name,
            {
                type: 'channel',
                action: 'delete',
                data: channel
            }
        );
    }


    /**
     * Get the pubStatus of document
     *
     * @returns {Object} Return object with current pubStatus of document
     */
    getPubStatus() {
        let newsItem = this.api.newsItemArticle,
            node = newsItem.querySelector('itemMeta pubStatus')

        if (!node) {
            return null
        }

        var pubStatusNode = jxon.build(node)
        pubStatusNode.qcode = pubStatusNode['@qcode']
        delete pubStatusNode['@qcode']

        return pubStatusNode
    }


    /**
     * Set pubStatus
     * Creates a pubStatus node in itemMeta if it not exists
     *
     * @param {string} name
     * @param {object} pubStatus
     *
     * @fires event.DOCUMENT_CHANGED
     */
    setPubStatus(name, pubStatus) {
        let newsItem = this.api.newsItemArticle,
            node = newsItem.querySelector('itemMeta pubStatus')

        if (!node) {
            let itemMetaNode = newsItem.querySelector('itemMeta')
            node = newsItem.createElementNS(itemMetaNode.namespaceURI, 'pubStatus')
            itemMetaNode.appendChild(node)
        }

        node.setAttribute('qcode', pubStatus.qcode)
        this.api.events.documentChanged(name, {
            type: 'pubStatus',
            action: 'set',
            data: pubStatus
        })
    }


    /**
     * Get pubStart
     *
     * @returns {object} Object {value: "2016-02-08T20:37:25 01:00", type: "imext:pubstart"}
     */
    getPubStart() {
        let pubStartNode = this._getItemMetaExtPropertyByType('imext:pubstart')
        if (!pubStartNode) {
            return null
        }

        let pubStartJson = jxon.build(pubStartNode)
        pubStartJson.value = pubStartJson['@value']
        pubStartJson.type = pubStartJson['@type']
        pubStartJson = omit(pubStartJson, ['@type', '@value'])

        return pubStartJson
    }


    /**
     * Set pubStart
     *
     * @param {string} name Plugin name
     * @param {object} pubStart Expect object with value property. Type is ignored. Object {value: "2016-02-08T20:37:25 01:00"}
     *
     * @fires event.DOCUMENT_CHANGED
     */
    setPubStart(name, pubStart) {
        let newsItem = this.api.newsItemArticle,
            pubStartNode = this._getItemMetaExtPropertyByType('imext:pubstart')

        if (!pubStartNode) {
            let itemMetaNode = newsItem.querySelector('itemMeta')
            pubStartNode = newsItem.createElementNS(itemMetaNode.namespaceURI, 'itemMetaExtProperty')
            itemMetaNode.appendChild(pubStartNode)
        }

        pubStartNode.setAttribute('value', pubStart.value)
        pubStartNode.setAttribute('type', 'imext:pubstart')

        this.api.events.documentChanged(name, {
            type: 'pubStart',
            action: 'set',
            data: pubStart
        })
    }


    /**
     * Remove the node for the pubStart
     *
     * @param name
     *
     * @fires event.DOCUMENT_CHANGED
     */
    removePubStart(name) {
        let pubStartNode = this._getItemMetaExtPropertyByType('imext:pubstart')

        if (pubStartNode) {
            pubStartNode.parentElement.removeChild(pubStartNode)
        }

        this.api.events.documentChanged(name, {
            type: 'pubStart',
            action: 'delete',
            data: {}
        });
    }


    /**
     * Get pubStop
     *
     * @returns {object}
     */
    getPubStop() {
        let pubStopNode = this._getItemMetaExtPropertyByType('imext:pubstop')

        if (!pubStopNode) {
            return null
        }

        let resultJson = jxon.build(pubStopNode)
        resultJson.type = resultJson['@type']
        resultJson.value = resultJson['@value']
        delete resultJson['@type']
        delete resultJson['@value']

        return resultJson
    }


    /**
     * Set pubStop.
     *
     * @param {string} name Plugin name
     * @param {object} pubStop
     *
     * @fires event.DOCUMENT_CHANGED
     */
    setPubStop(name, pubStop) {
        let newsItem = this.api.newsItemArticle,
            pubStopNode = this._getItemMetaExtPropertyByType('imext:pubstop')

        if (!pubStopNode) {
            let itemMetaNode = newsItem.querySelector('itemMeta')
            pubStopNode = newsItem.createElementNS(itemMetaNode.namespaceURI, 'itemMetaExtProperty')
            itemMetaNode.appendChild(pubStopNode)
        }

        pubStopNode.setAttribute('value', pubStop.value)
        pubStopNode.setAttribute('type', 'imext:pubstop')

        this.api.events.documentChanged(name, {
            type: 'pubStop',
            action: 'set',
            data: pubStop
        })
    }


    /**
     * Remove the node for pubStop.
     *
     * @param {string} name Plugin name
     */
    removePubStop(name) {
        let pubStopNode = this._getItemMetaExtPropertyByType('imext:pubstop')
        if (pubStopNode) {
            pubStopNode.parentElement.removeChild(pubStopNode)
        }

        this.api.events.documentChanged(name, {
            type: 'pubStop',
            action: 'delete',
            data: {}
        });
    }

    /**
     * Get editorial note from edNote element in itemMeta section.
     * @return {String}
     */
    getEdNote() {
        let newsItem = this.api.newsItemArticle,
            node = newsItem.querySelector('itemMeta edNote')

        if (!node) {
            return ''
        }

        return node.textContent
    }

    /**
     * Set editorial note content in edNote element in itemMeta section
     * @param {string} content String content of editorial note
     * @throws {Error}
     */
    setEdNote(content) {
        const newsItem = this.api.newsItemArticle
        const itemMeta = newsItem.querySelector('itemMeta')
        let node = newsItem.querySelector('itemMeta > edNote')

        if (typeof content !== 'string' && content !== null) {
            throw new Error('Argument is not of type string or null')
        }

        if (!content) {
            if (node) {
                itemMeta.removeChild(node)
            }
            return
        }

        if (!node) {
            node = newsItem.createElementNS(
                itemMeta.namespaceURI,
                'edNote'
            )
        }

        node.textContent = content
        itemMeta.appendChild(node)

        this.api.events.documentChanged(name, {
            type: 'edNote',
            action: 'set',
            data: content
        })
    }

    /**
     * Get Newspilot article id (if any).
     *
     * @return {*}
     */
    getNewspilotArticleId() {
        let articleIdNode = this._getItemMetaExtPropertyByType('npext:articleid')

        if (articleIdNode) {
            return articleIdNode.getAttribute('value')
        }

        return null;
    }


    /**
     * Get all author links in itemMeta links
     *
     * @returns {*}
     */
    getAuthors(/*name*/) {

        /*jshint validthis:true */
        function normalizeObject(object) {
            Object.keys(object).forEach(function (key) {
                if (startsWith(key, '@')) {
                    var newKey = replace(key, '@', '');
                    object[newKey] = object[key];
                    delete object[key];
                }
            }.bind(this));
            return object;
        }

        var authorNodes = this._getLinksByType('x-im/author');
        if (!authorNodes) {
            return null;
        }

        var authors = [];
        var length = authorNodes.length;
        for (var i = 0; i < length; i++) {
            var author = jxon.build(authorNodes[i]);

            let normalizedAuthor = normalizeObject(author);

            if (!authors.find((existingAuthor) => {
                    if (nilUUID.isNilUUID(existingAuthor.uuid)) {
                        return existingAuthor.title === normalizedAuthor.title
                    } else {
                        return existingAuthor.uuid === normalizedAuthor.uuid
                    }
                })) {
                authors.push(normalizedAuthor);
            }
        }

        return authors;
    }


    /**
     * Remove an author from newsItem.
     *
     * @param {string} name Name of the plugin
     * @param {string} uuid The UUID of the author to be deleted
     *
     * @fires event.DOCUMENT_CHANGED
     * @throws {NotFoundError}  When no node is found by provided UUID the NotFoundError is thrown
     */
    removeAuthorByUUID(name, uuid) {
        var authorNode = this.api.newsItemArticle.querySelector(
            'itemMeta > links > link[type="x-im/author"][uuid="' + uuid + '"]');

        if (authorNode) {
            authorNode.parentElement.removeChild(authorNode);
            this.api.events.documentChanged(name, {
                type: 'author',
                action: 'delete',
                data: authorNode
            });
        }
        else {
            throw new NotFoundError('Could not find authorNode with UUID: ' + uuid);
        }
    }


    /**
     * Add an known author with a specified uuid to the newsItem
     *
     * @param {string} name Plugin name
     * @param {object} author Author object with the properties name and uuid
     *
     * @fires event.DOCUMENT_CHANGED
     */
    addAuthor(name, author) {
        if (this._getLinkByUuid(author.uuid)) {
            console.info(`Author with uuid: ${author.uuid} already exists`)
            return
        }

        var newsItem = this.api.newsItemArticle;
        var linksNode = newsItem.querySelector('itemMeta > links');
        var authorLinkNode = newsItem.createElementNS(linksNode.namespaceURI, 'link');

        authorLinkNode.setAttribute('title', author.name);
        authorLinkNode.setAttribute('uuid', author.uuid);
        authorLinkNode.setAttribute('rel', 'author');
        authorLinkNode.setAttribute('type', 'x-im/author');

        linksNode.appendChild(authorLinkNode);

        this.api.events.documentChanged(name, {
            type: 'author',
            action: 'add',
            data: author
        });
    }

    /**
     * Add an simple/unknown author to the newsItem
     *
     * @param {string} name Plugin name
     * @param {object} author Author object with the properties name and uuid
     *
     * @fires event.DOCUMENT_CHANGED
     */
    addSimpleAuthor(name, authorName) {
        var newsItem = this.api.newsItemArticle;
        var linksNode = newsItem.querySelector('itemMeta > links');
        var authorLinkNode = newsItem.createElementNS(linksNode.namespaceURI, 'link');

        authorLinkNode.setAttribute('title', authorName);
        authorLinkNode.setAttribute('uuid', '00000000-0000-0000-0000-000000000000');
        authorLinkNode.setAttribute('rel', 'author');
        authorLinkNode.setAttribute('type', 'x-im/author');
        linksNode.appendChild(authorLinkNode);

        this.api.events.documentChanged(name, {
            type: 'author',
            action: 'add',
            data: authorName
        });
    }


    /**
     * Updates itemMeta > links > link[type="x-im/author"]/@name for specified uuid.
     *
     * If parameter author object contains any of
     *  - email
     *  - firstName
     *  - lastName
     *  - phone
     *  - facebookUrl
     *  - twitterUrl
     *  - shortDescription
     *  - longDescription
     *  a child element, 'data', will be created and a child element to
     *  that element with the name of object field will be created, e.g. data > phone.
     *
     *  Note that an existing 'data' element will be removed from link.
     *
     * @fixme This method can potentially change the NewsML dom without firing DOCUMENT_CHANGED event
     *
     * @param {string} name - Plugin name
     * @param {string} uuid - The uuid for the author in the newsItem
     * @param {object} author - Object containing name and, optional, fields (see above)
     */
    updateAuthorWithUUID(name, uuid, author) {
        const newsItem = this.api.newsItemArticle

        let authorNode = newsItem.querySelector('itemMeta > links > link[type="x-im/author"][uuid="' + uuid + '"]')
        authorNode.setAttribute('title', author.name);

        // Remove old 'data' element
        let deleteDataNode = authorNode.querySelector('data')
        if (deleteDataNode) {
            deleteDataNode.parentElement.removeChild(deleteDataNode);
        }

        const nsUri = authorNode.namespaceURI
        let addDataNode
        if (author.email || author.firstName || author.lastName || author.phone || author.facebookUrl ||
            author.twitterUrl || author.shortDescription || author.longDescription) {
            addDataNode = newsItem.createElementNS(
                nsUri,
                'data'
            )
            authorNode.appendChild(addDataNode)
        }

        if (!addDataNode) {
            // We are done, early exit
            return
        }

        if (author.email) {
            this._createAndAddChildNode(addDataNode, 'email', author.email, nsUri)
        }
        if (author.firstName) {
            this._createAndAddChildNode(addDataNode, 'firstName', author.firstName, nsUri)
        }
        if (author.lastName) {
            this._createAndAddChildNode(addDataNode, 'lastName', author.lastName, nsUri)
        }
        if (author.phone) {
            this._createAndAddChildNode(addDataNode, 'phone', author.phone, nsUri)
        }
        if (author.facebookUrl) {
            this._createAndAddChildNode(addDataNode, 'facebookUrl', author.facebookUrl, nsUri)
        }
        if (author.twitterUrl) {
            this._createAndAddChildNode(addDataNode, 'twitterUrl', author.twitterUrl, nsUri)
        }
        if (author.shortDescription) {
            this._createAndAddChildNode(addDataNode, 'shortDescription', author.shortDescription, nsUri)
        }
        if (author.longDescription) {
            this._createAndAddChildNode(addDataNode, 'longDescription', author.longDescription, nsUri)
        }

        this.api.events.documentChanged(name, {
            type: 'author',
            action: 'update',
            data: author,
            node: extractNodeInfo(authorNode)
        });
    }

    /**
     * Update existing concept link with new data
     *
     * @param {string} name
     * @param {object} conceptObject
     * @param {object} propertyMap
     * @param {boolean} triggerDocumentChanged set to false to suppress document changed event, default is set to true
     *
     * @fires event.DOCUMENT_CHANGED Fires a documentChanged event with updated link
     */
    updateConcept(name, conceptObject, propertyMap, triggerDocumentChanged = true) {
        const newsItem = this.api.newsItemArticle

        const conceptNode = newsItem.querySelector(`itemMeta > links > link[uuid="${conceptObject.uuid}"]`)

        if (conceptNode) {
            conceptNode.setAttribute('title', conceptObject[propertyMap.ConceptName])
            this.updateConceptData(conceptObject, conceptNode)

            if (conceptObject[propertyMap.ConceptBroaderRelation] || conceptObject[propertyMap.ConceptAssociatedWithRelations]) {
                const linksNode = conceptNode.querySelector('links')

                if (linksNode) {
                    linksNode.parentElement.removeChild(linksNode)
                }
                const nsUri = conceptNode.namespaceURI
                const newLinksNode = newsItem.createElementNS(nsUri, 'links')

                conceptNode.appendChild(newLinksNode)

                this.updateRelationalLinks('broader', conceptObject[propertyMap.ConceptBroaderRelation], conceptNode, propertyMap)
                if (Array.isArray(conceptObject[propertyMap.ConceptAssociatedWithRelations])) {
                    conceptObject[propertyMap.ConceptAssociatedWithRelations].forEach(associatedConcept => this.updateRelationalLinks('associated-with', associatedConcept, conceptNode, propertyMap))
                } else {
                    this.updateRelationalLinks('associated-with', conceptObject[propertyMap.ConceptAssociatedWithRelations], conceptNode, propertyMap)
                }
            }

            if (triggerDocumentChanged) {
                this.api.events.documentChanged(name, {
                    type: conceptObject.type,
                    action: 'update',
                    data: conceptObject,
                    node: extractNodeInfo(conceptNode)
                });
            }
        }
    }

    /**
     * Recursive function that will add a concepts Broader relations as links in the existing concept link
     *
     * @param {object} conceptObject
     * @param {object} conceptNode
     * @param {object} propertyMap
     */
    updateRelationalLinks(relation, conceptObject, conceptNode, propertyMap) {
        if (conceptObject) {
            const newsItem = this.api.newsItemArticle
            const linksNode = conceptNode.querySelector('links')

            if (linksNode) {
                const nsUri = conceptNode.namespaceURI
                const link = newsItem.createElementNS(nsUri, 'link')

                link.setAttribute('rel', relation)
                link.setAttribute('title', conceptObject[propertyMap.ConceptName])
                link.setAttribute('type', conceptObject[propertyMap.ConceptImTypeFull])
                link.setAttribute('uuid', conceptObject.uuid)

                linksNode.appendChild(link)

                if (conceptObject[propertyMap.ConceptBroaderRelation]) {
                    this.updateRelationalLinks('broader', conceptObject[propertyMap.ConceptBroaderRelation], conceptNode, propertyMap)
                }
            }
        }
    }

    /**
     * Update a concept links data node
     *
     * @param {object} conceptObject
     * @param {object} conceptNode
     */
    updateConceptData(conceptObject, conceptNode) {
        conceptNode = conceptNode || this._getLinkByUuid(conceptObject.uuid)
        const newsItem = this.api.newsItemArticle
        const nsUri = conceptNode.namespaceURI
        const dataNode = conceptNode.querySelector('data')

        conceptNode.setAttribute('title', conceptObject.name)

        if (dataNode) {
            dataNode.parentElement.removeChild(dataNode);
        }

        if (conceptObject.articleData) {
            const newDataNode = newsItem.createElementNS(nsUri, 'data')
            const articleDataKeys = Object.keys(conceptObject.articleData)

            if (articleDataKeys.length) {
                Object.keys(conceptObject.articleData).forEach(key => {
                    if (conceptObject.articleData[key] && conceptObject.articleData[key] !== '') {
                        this._createAndAddChildNode(newDataNode, key, conceptObject.articleData[key], nsUri)
                    }
                })
                conceptNode.appendChild(newDataNode)
            }
        }
    }

    /**
     * Attach link with related-geo data to article meta
     *
     * @param {object} relatedGeoPolygons
     */
    createExtendedGeoLink(relatedGeoPolygons) {
        const newsItem = this.api.newsItemArticle
        const linksNode = newsItem.querySelector(`itemMeta > links`)
        const geoLinkNode = newsItem.querySelector(`itemMeta > links > link[rel="related-geo"]`)

        if (linksNode) {
            if (geoLinkNode) {
                geoLinkNode.parentElement.removeChild(geoLinkNode)
            }

            if (relatedGeoPolygons.length) {
                const nsUri = linksNode.namespaceURI

                const newGeoLinkNode = newsItem.createElementNS(nsUri, 'link')
                const geoData = newsItem.createElementNS(nsUri, 'data')

                relatedGeoPolygons.forEach(geo => {
                    const uuidNode = newsItem.createElementNS(nsUri, 'uuid')
                    const textNode = newsItem.createTextNode(geo.uuid)

                    uuidNode.setAttribute('title', geo.ConceptName)
                    uuidNode.appendChild(textNode)
                    geoData.appendChild(uuidNode)
                })

                newGeoLinkNode.setAttribute('rel', 'related-geo')
                newGeoLinkNode.appendChild(geoData)
                linksNode.appendChild(newGeoLinkNode)
            }
        }
    }

    /**
     * Helper function to create and/or add a child node with text content
     * in a specified namespace to a parent node.
     *
     * @private
     *
     * @param {XMLElement}
     * @param {string}
     * @param {string}
     * @param {string} nsUri Namespace declaration
     */
    _createAndAddChildNode(parent, nodeName, nodeValue, nsUri) {
        let node
        if (nsUri) {
            node = parent.ownerDocument.createElementNS(nsUri, nodeName)
        }
        else {
            node = parent.ownerDocument.createElement(nodeName)
        }

        node.textContent = nodeValue

        parent.appendChild(node)
    }

    /**
     * Remove an author from newsItem
     *
     * @param {string} name Name of the plugin
     * @param {string} authorName The name of the author to be deleted
     *
     * @throws {NotFoundError}  When no node is found by provided authorName the NotFoundError is thrown
     * @fires event.DOCUMENT_CHANGED
     */
    removeAuthorByTitle(name, authorName) {
        var authorNode = this.api.newsItemArticle.querySelector(
            'itemMeta > links > link[type="x-im/author"][title*="' + authorName + '"]');

        if (authorNode) {
            authorNode.parentElement.removeChild(authorNode);
            this.api.events.documentChanged(name, {
                type: 'author',
                action: 'delete',
                data: authorName
            });
        }
        else {
            throw new NotFoundError('Could not find authorNode with title: ' + authorName);
        }
    }


    /**
     * Helper function to remove all @ on properties
     * @private
     *
     * @param {object} object
     *
     * @returns {*}
     */
    normalizeObject(object) {
        Object.keys(object).forEach(function (key) {
            if (startsWith(key, '@')) {
                var newKey = replace(key, '@', '');
                object[newKey] = object[key];
                delete object[key];
            }
        }.bind(this));
        return object;
    }


    /**
     *
     * Generic method to retrieve links with a certain type from the itemMeta section
     *
     * @example
     * import {api} from 'writer'
     * api.newsItem.getLinksByType(this.name, [ 'x-im/organisation', 'x-im/person', 'x-im/topic' ], "subject")
     *
     * @param name Plugin name
     * @param {array} types Types of links to select
     * @param {string} subject optional Which kind of subject to select, defaults to "subject"
     * @returns {*}
     */
    getLinksByType(name, types, subject) {

        if (!isArray(types)) {
            throw new Error("Argument types is not of type: array");
        }
        if (!subject) {
            subject = "subject";
        }

        var querySelectors = [];
        types.forEach(function (type) {
            querySelectors.push('itemMeta > links > link[type="' + type + '"][rel="' + subject + '"]');
        }.bind(this));

        var querySelectorString = querySelectors.join(', ');
        var tagLinkNodes = this.api.newsItemArticle.querySelectorAll(querySelectorString);
        if (!tagLinkNodes) {
            return null;
        }

        var tags = [];
        var length = tagLinkNodes.length;
        for (var i = 0; i < length; i++) {
            var tag = jxon.build(tagLinkNodes[i]);
            var normalizedTag = this.normalizeObject(tag);
            tags.push(normalizedTag);
        }
        return tags;
    }


    /**
     * Get tags (link elements from the itemMeta section)
     *
     * @param types An array of types considered being tags. Example ['x-im/person, x-im/channel']
     *
     * @example:
     * {
     *  rel: "subject",
     *  title: "Dalarna",
     *  type: "x-im/category",
     *  uuid: "03d22994-91e4-11e5-8994-feff819cdc9f"
     * }
     *
     * @returns {*} Return array of tags in JSON or null if no links was found
     */
    getTags(types) {

        const querySelectors = types.map(item => `itemMeta > links > link[type="${item}"][rel="subject"]`).join(', ')

        var tagLinkNodes = this.api.newsItemArticle.querySelectorAll(querySelectors)

        if (!tagLinkNodes) {
            return null;
        }

        var tags = [];
        var length = tagLinkNodes.length;
        for (var i = 0; i < length; i++) {
            var tag = jxon.build(tagLinkNodes[i]);
            var normalizedTag = this.normalizeObject(tag);
            tags.push(normalizedTag);
        }
        return tags;
    }


    /**
     * Adds a tag to itemMeta > links section in newsItem
     *
     * The format used is identical to the search response provided by concepts backend
     * @Example
     * {
     *     "uuid": "88d36cbe-d6dd-11e5-ab30-625662870761",
     *     "name": ["2016 Eurovision Song Contest"],
     *     "type": ["story"],
     *     "typeCatalog": ["imnat"],
     *     "imType": ["x-im/story"],
     *     "inputValue": "s"
     * }
     *
     * @param {string} name The name of the plugin
     * @param {object} tag Must containt title, type and uuid
     *
     * @fires event.DOCUMENT_CHANGED
     */
    addTag(name, tag) {
        if (this._getLinkByUuid(tag.uuid)) {
            console.info(`Tag with uuid: ${tag.uuid} already exists`)
            return
        }

        var newsItem = this.api.newsItemArticle;
        var linksNode = newsItem.querySelector('itemMeta > links');
        var tagLinkNode = newsItem.createElementNS(linksNode.namespaceURI, 'link');

        tagLinkNode.setAttribute('title', tag.name[0]);
        tagLinkNode.setAttribute('uuid', tag.uuid);
        tagLinkNode.setAttribute('rel', 'subject');
        tagLinkNode.setAttribute('type', tag.imType[0]);
        linksNode.appendChild(tagLinkNode);

        this.api.events.documentChanged(name, {
            type: 'tag',
            action: 'add',
            data: tag,
            node: extractNodeInfo(tagLinkNode)
        });
    }


    /**
     * Update a tag in itemMeta > links section
     *
     * @param {string} name The name of the plugin
     * @param {string} uuid The UUID of the link element
     * @param {object} tag The tag, same format as concept backend provides in search {"name": [ "2016 Eurovision Song Contest" ], "type": [ "story" ], "typeCatalog": [ "imnat" ], "imType": [ "x-im/story" ] }
     *
     * @fires event.DOCUMENT_CHANGED
     * @throws {NotFoundError}  When no node is found by provided UUID the NotFoundError is thrown
     */
    updateTag(name, uuid, tag) {
        var subject = tag.subject ? tag.subject : "subject";
        var newsItem = this.api.newsItemArticle;
        var tagLinkNode = newsItem.querySelector('itemMeta > links > link[uuid="' + uuid + '"]');

        if (!tagLinkNode) {
            throw new NotFoundError('Could not find linkNode with UUID: ' + uuid);
        }

        tagLinkNode.setAttribute('title', tag.name[0]);
        tagLinkNode.setAttribute('rel', subject);
        tagLinkNode.setAttribute('type', tag.imType[0]);

        this.api.events.documentChanged(name, {
            type: 'tag',
            action: 'update',
            data: tag,
            node: extractNodeInfo(tagLinkNode)
        });
    }


    /**
     * Removes a link in itemMeta links by providing an UUID
     *
     * @param name The name of the plugin calling the method
     * @param uuid The uuid of the link to be removed
     *
     * @fires event.DOCUMENT_CHANGED
     */
    removeLinkByUUID(name, uuid) {
        var linkNode = this.api.newsItemArticle.querySelector('itemMeta > links > link[uuid="' + uuid + '"]')

        if (linkNode) {
            linkNode.parentElement.removeChild(linkNode)
            this.api.events.documentChanged(name, {
                type: 'tag',
                action: 'delete',
                data: uuid,
                node: extractNodeInfo(linkNode)
            })
        }
        else {
            throw new NotFoundError('Could not find linkNode with UUID: ' + uuid)
        }
    }

    /**
     * Removes a link in itemMeta links by providing an URI
     *
     * @param {string} name The name of the plugin calling the method
     * @param {string} uri The URI of the link to be removed
     *
     * @fires event.DOCUMENT_CHANGED
     */
    removeLinkByURI(name, uri) {
        const linkNode = this.api.newsItemArticle.querySelector(`itemMeta > links > link[uri="${uri}"]`)

        if (linkNode) {
            linkNode.parentElement.removeChild(linkNode)
            this.api.events.documentChanged(name, {
                type: 'link',
                action: 'delete',
                data: uri,
                node: extractNodeInfo(linkNode)
            })
        }
        else {
            throw new NotFoundError(`Could not find linkNode with uri: ${uri}`)
        }
    }

    /**
     * Removes all links in itemMeta links by providing a type
     *
     * @param {string} name of the plugin calling the method
     * @param {string} type of the links to be removed
     *
     * @fires event.DOCUMENT_CHANGED
     */
    removeAllLinksByType(name, type) {
        const linkNodes = this.api.newsItemArticle.querySelectorAll(`itemMeta > links > link[type="${type}"]`)
        const removedNodes = []

        if (linkNodes) {
            linkNodes.forEach(linkNode => {
                removedNodes.push(extractNodeInfo(linkNode))
                linkNode.parentElement.removeChild(linkNode)
            })

            this.api.events.documentChanged(name, {
                type: 'link',
                action: 'delete-all',
                data: type,
                nodes: removedNodes
            })
        } else {
            throw new NotFoundError(`Could not find linkNode with uri: ${type}`)
        }
    }

    /**
     * Remove a link from itemMeta links section by type and rel attributes
     *
     * @param {string} name
     * @param {string} uuid
     * @param {string} rel
     *
     * @fires event.DOCUMENT_CHANGED
     */
    removeLinkByUUIDAndRel(name, uuid, rel) {
        var linkNode = this.api.newsItemArticle.querySelector(
            'itemMeta > links > link[uuid="' + uuid + '"][rel="' + rel + '"]')

        if (linkNode) {
            linkNode.parentElement.removeChild(linkNode)
            this.api.events.documentChanged(name, {
                type: 'link',
                action: 'delete',
                data: rel,
                node: extractNodeInfo(linkNode)
            })
        }
        else {
            throw new NotFoundError('Could not find linkNode with UUID: ' + uuid)
        }
    }

    /**
     * Remove a link from contentMeta links section by type and rel attributes
     *
     * @param {string} name
     * @param {string} type
     * @param {string} rel
     *
     * @fires event.DOCUMENT_CHANGED
     */
    removeLinkContentMetaByTypeAndRel(name, type, rel) {
        let linkNodes = this.api.newsItemArticle.querySelectorAll(
            'contentMeta > links > link[type="' + type + '"][rel="' + rel + '"]')

        linkNodes.forEach((linkNode) => {
            linkNode.parentElement.removeChild(linkNode)
            this.api.events.documentChanged(name, {
                type: 'link',
                action: 'delete',
                data: rel,
                node: extractNodeInfo(linkNode)
            })
        })

        if (linkNodes.length === 0) {
            throw new NotFoundError('Could not find linkNode with type: ' + type + 'and rel: ' + rel)
        }
    }

    /**
     * Removes links from contentMeta links section that matches provided filter and type.
     *
     * The filter function is called for each link mathing the type. If the filter returns 'true', the link is removed.
     * @param {string} name The name of the plugin performing the remove.
     * @param {string} type The link type that should be part of removal
     * @param {function} filter A function that gets the a link as a argument. Should return 'true' if the link should be removed.
     */
    removeLinkContentMetaByTypeAndMatchingFilter(name, type, filter) {
        let linkNodes = this.api.newsItemArticle.querySelectorAll(
            `contentMeta > links > link[type="${type}"]`
        )

        linkNodes.forEach((linkNode) => {

            const shouldDelete = filter(linkNode)

            if (shouldDelete) {
                linkNode.parentElement.removeChild(linkNode)
                this.api.events.documentChanged(name, {
                    type: 'link',
                    action: 'delete',
                    data: type,
                    node: extractNodeInfo(linkNode)
                })
            }
        })
    }


    /**
     * Adds a new x-im/place link into itemMeta links
     *
     * @example
     * {
     *  "data":
     *    {
     *      "position":"POINT(16.570516 56.774485)"
     *    },
     *  "rel":"subject",
     *  "title":"Rälla",
     *  "type":"x-im/place",
     *  "uuid":"6599923a-d626-11e5-ab30-625662870761"
     * }
     *
     * @param name Plugin name calling function
     * @param location The location in JSON containing
     *
     * @fires event.DOCUMENT_CHANGED
     */
    addLocation(name, location) {
        if (this._getLinkByUuid(location.uuid)) {
            console.info(`Location with uuid: ${location.uuid} already exists`)
            return
        }

        var newsItem = this.api.newsItemArticle;
        var linksNode = newsItem.querySelector('itemMeta > links');
        var locationLinkNode = newsItem.createElementNS(linksNode.namespaceURI, 'link');

        locationLinkNode.setAttribute('title', location.title);
        locationLinkNode.setAttribute('uuid', location.uuid);
        locationLinkNode.setAttribute('rel', 'subject');
        locationLinkNode.setAttribute('type', location.type);

        // Position is optional so check if position is provided by users
        if (location.data && location.data.position) {
            var dataNode = newsItem.createElementNS(locationLinkNode.namespaceURI, 'data'),
                positionNode = newsItem.createElementNS(dataNode.namespaceURI, 'geometry');

            positionNode.textContent = location.data.position;
            dataNode.appendChild(positionNode);

            locationLinkNode.appendChild(dataNode);
        }

        linksNode.appendChild(locationLinkNode);

        this.api.events.documentChanged(name, {
            type: 'location',
            action: 'add',
            data: location,
            node: extractNodeInfo(locationLinkNode)
        });
    }

    /**
     * Update a location
     *
     * @param {string} name Name of plugin
     * @param {object} location The location in JSON
     *
     * @fires event.DOCUMENT_CHANGED
     * @throws Error
     */
    updateLocation(name, location) {
        var uuid = location.uuid;
        var linkNode = this.api.newsItemArticle.querySelector('itemMeta > links > link[uuid="' + uuid + '"]');

        if (linkNode) {
            linkNode.setAttribute('title', location.title);

            var positionNode = linkNode.querySelector('geometry');
            if (!positionNode) {
                var dataNode = this.api.newsItemArticle.createElementNS(linkNode.namespaceURI, 'data');
                positionNode = this.api.newsItemArticle.createElementNS(dataNode.namespaceURI, 'geometry');
                dataNode.appendChild(positionNode);
                linkNode.appendChild(dataNode);
            }
            positionNode.textContent = location.data.position;

            this.api.events.documentChanged(name, {
                type: 'location',
                action: 'update',
                data: location,
                node: extractNodeInfo(linkNode)
            });
        }
        else {
            throw new NotFoundError('Could not find linkNode with UUID: ' + uuid);
        }
    }

    /**
     * Get all location with link type x-im/place, x-im/polygon or x-im/position with the specified entity
     *
     * @param {string} entity Optional entity specification, either "all", "position" or "polygon"
     *
     * @returns {array} {"data":{"position":"POINT(16.570516 56.774485)"},"rel":"subject","title":"Rälla","type":"x-im/place","uuid":"6599923a-d626-11e5-ab30-625662870761"}
     */
    getLocations(entity) {
        // Need to fetch all supported location types since there are two use cases, (1) all
        // locations are stored with type 'x-im/place' and (2) locations are stored with their
        // specific type, i.e. 'x-im/polygon' or 'x-im/position'.
        var locationNodes = this._getLinksByType(['x-im/place', 'x-im/polygon', 'x-im/position']);
        if (!locationNodes) {
            return null;
        }

        if (entity !== 'position' && entity !== 'polygon') {
            entity = 'all';
        }

        var locations = [];
        var length = locationNodes.length;
        for (var i = 0; i < length; i++) {
            var tag = jxon.build(locationNodes[i]);
            var normalizedTag = this.normalizeObject(tag);

            if (entity === 'all') {
                locations.push(normalizedTag);
            }
            else if (entity === 'polygon' && (normalizedTag.type === 'x-im/polygon' || (normalizedTag.data && normalizedTag.data.geometry && normalizedTag.data.geometry.indexOf('POLYGON') !== -1))) {
                locations.push(normalizedTag);
            }
            else if (entity === 'position' && (normalizedTag.type === 'x-im/position' || (normalizedTag.data && normalizedTag.data.geometry && normalizedTag.data.geometry.match(/^POINT/)))) {
                locations.push(normalizedTag);
            }
        }

        return locations;
    }


    /**
     * Adds a link to itemMeta links section
     *
     * @Example
     * import {api} from 'writer'
     *
     * api.newsItem.addLink('Pluginname', {
     *       '@rel': 'channel',
     *       '@title': 'Jeremy Spencer',
     *       '@type': 'x-im/author',
     *       '@uuid': '5f9b8064-d54f-11e5-ab30-625662870761'
     *   });
     * <link rel="author" title="Jeremy Spencer" type="x-im/author" uuid="5f9b8064-d54f-11e5-ab30-625662870761"/>
     *
     * @param {string} name The name of the plugin adding the link
     * @param {object} link Uses jxon.unbuild to transform JSON to XML. Make sure to use @ property names for attributes.
     * @param {boolean} triggerDocumentChanged set to false to suppress document changed event, default is set to true
     *
     * @fires event.DOCUMENT_CHANGED Fires a documentChanged event with added link
     */
    addLink(name, link, triggerDocumentChanged = true) {
        const uuid = link.uuid || link['@uuid']
        const newRel = link.rel || link['@rel']
        const existingLink = this._getLinkByUuid(uuid)

        if (existingLink && existingLink.getAttribute('rel') === newRel) {
            console.info(`Tag with uuid: ${uuid} and rel: ${newRel} already exists`)
            return
        }
        this._addLink(name, link, 'itemMeta', triggerDocumentChanged);
    }

    /**
     * Updates the rel value on a meta link
     *
     * @param {string} name The name of the plugin that is triggering the change
     * @param {object} link a link object with a valid uuid and valid rel
     *
     * @example
     * api.newsItem.updateLinkRel('pluginName', {
     *      uuid: 5f9b8064-d54f-11e5-ab30-625662870761,
     *      rel: 'mainchannel'
     * })
     */
    updateLinkRel(name, link) {
        const linkNode = this.api.newsItemArticle.querySelector(`itemMeta > links > link[uuid="${link.uuid}"]`)

        if (linkNode) {
            linkNode.setAttribute('rel', link.rel)
            this.api.events.documentChanged(name, {
                type: link.type,
                action: 'update',
                data: link
            })
        }
        else {
            throw new NotFoundError(`Could not find linkNode with UUID: ${link.uuid}`)
        }
    }

    /**
     * Adds a link to contentMeta links section
     *
     * @Example
     * import {api} from 'writer'
     *
     * api.newsItem.addContentMetaLink('PluginName', {
     *       '@rel': 'gender',
     *       '@title': 'Male',
     *       '@type': 'x-im/gender',
     *       '@uri': 'im://gender/male'
     *   });
     * <link title="Male" uri="im://gender/male" rel="gender" type="x-im/gender"/>
     *
     * @param {string} name The name of the plugin adding the link
     * @param {object} link Uses jxon.unbuild to transform JSON to XML. Make sure to use @ property names for attributes.
     *
     * @fires event.DOCUMENT_CHANGED Fires a documentChanged event with added link
     */
    addContentMetaLink(name, link) {
        this._addLink(name, link, 'contentMeta');
    }

    /**
     *
     * @param {string} name
     * @param {object} link
     * @param {string} context either itemMeta or contentMeta
     * @param {boolean} triggerDocumentChanged set to false to suppress document changed event, default is set to true
     *
     * @private
     */
    _addLink(name, link, context, triggerDocumentChanged = true) {
        let metaLinksNode = this.api.newsItemArticle.querySelector(context + ' > links');

        if (!metaLinksNode) {
            let contextMetaNode = this.api.newsItemArticle.querySelector(context);

            metaLinksNode = this.api.newsItemArticle.createElementNS(contextMetaNode.namespaceURI, 'links');
            metaLinksNode.setAttribute('xmlns', 'http://www.infomaker.se/newsml/1.0');

            contextMetaNode.appendChild(metaLinksNode);
        }

        const linkXML = jxon.unbuild(link, metaLinksNode.namespaceURI, 'link');
        const node = extractNodeInfo(linkXML.documentElement)
        metaLinksNode.appendChild(linkXML.documentElement);

        if (triggerDocumentChanged) {
            this.api.events.documentChanged(name, {
                type: 'link',
                action: 'add',
                data: link,
                node: node
            });
        }
    }


    /**
     * Retrieve links from itemMeta section by specified type and rel
     *
     * @param {string} name
     * @param {string} type
     * @param {string} rel
     *
     * @returns {array} Array of links
     */
    getLinkByTypeAndRel(name, type, rel) {
        var linkNodes = this.api.newsItemArticle.querySelectorAll(
            'itemMeta > links > link[type="' + type + '"][rel="' + rel + '"]');
        if (!linkNodes) {
            return null;
        }

        var links = [];
        for (var i = 0; i < linkNodes.length; i++) {
            links.push(jxon.build(linkNodes[i]));
        }

        return links;
    }


    /**
     * Retrieve links from itemMeta section by specified type
     *
     * @param {string} name Name of the plugin
     * @param {string} type The link type
     *
     * @returns {array} Return array of links transformed to JSON
     */
    getLinkByType(name, type) {
        return this._getLinkByType(name, type, 'itemMeta');
    }

    /**
     * Get links in contentMeta links section by specified type
     *
     * @param {string} name Name of the plugin
     * @param {string} type The link type
     *
     * @returns {array} Return array of links transformed to JSON
     */
    getContentMetaLinkByType(name, type) {
        return this._getLinkByType(name, type, 'contentMeta');
    }

    /**
     * Get links in context links section by specified type
     *
     * @param {string} name
     * @param {string} type
     * @param {string} context Either itemMeta or contentMeta
     *
     * @returns {*}
     * @private
     */
    _getLinkByType(name, type, context) {
        const linkNodes = this.api.newsItemArticle.querySelectorAll(context + ' links link[type="' + type + '"]');
        if (!linkNodes) {
            return null;
        }

        let links = [];
        for (let i = 0; i < linkNodes.length; i++) {
            links.push(jxon.build(linkNodes[i]));
        }

        return links;
    }


    /**
     * Get stories
     *
     * @return {array} Array of stories found
     */
    getStories() {
        var linkNodes = this._getLinksByType('x-im/story');
        if (!linkNodes) {
            return null;
        }

        var stories = [];
        var length = linkNodes.length;
        for (var i = 0; i < length; i++) {
            var link = jxon.build(linkNodes[i]);
            var normalizedTag = this.normalizeObject(link);
            stories.push(normalizedTag);
        }

        return stories;
    }

    /**
     * Get concept sections
     *
     * @returns {array} Array of concept sections
     */
    getConceptSections() {
        var linkNodes = this._getLinksByType('x-im/section')
        if (!linkNodes) {
            return null
        }

        var sections = []
        var length = linkNodes.length
        for (var i = 0; i < length; i++) {
            var link = jxon.build(linkNodes[i])
            var normalizedTag = this.normalizeObject(link)
            sections.push(normalizedTag)
        }

        return sections;
    }


    /**
     * Add a story link to itemMeta links section
     *
     * @example
     * {
     *  "uuid": "88d36cbe-d6dd-11e5-ab30-625662870761",
     *  "title": "A name"
     * }
     * @param name
     * @param story
     *
     * @fires event.DOCUMENT_CHANGED
     */
    addStory(name, story) {
        if (this._getLinkByUuid(story.uuid)) {
            console.info(`Story with uuid: ${story.uuid} already exists`)
            return
        }

        var newsItem = this.api.newsItemArticle;
        var linksNode = newsItem.querySelector('itemMeta > links');
        var linkNode = newsItem.createElementNS(linksNode.namespaceURI, 'link');

        linkNode.setAttribute('title', story.title);
        linkNode.setAttribute('uuid', story.uuid);
        linkNode.setAttribute('rel', 'subject');
        linkNode.setAttribute('type', 'x-im/story');

        linksNode.appendChild(linkNode);
        this.api.events.documentChanged(name, {
            type: 'story',
            action: 'add',
            data: story
        });
    }


    /**
     * Updates title on existing story
     * @param {string} name Plugin name
     * @param {object} story A story object that atleast contains title and uuid
     *
     * @throws NotFoundError
     * @fires event.DOCUMENT_CHANGED
     *
     * @example
     * {
     *  "uuid": "88d36cbe-d6dd-11e5-ab30-625662870761",
     *  "title": "A name"
     * }
     */
    updateStory(name, story) {
        var uuid = story.uuid;
        var linkNode = this.api.newsItemArticle.querySelector('itemMeta > links > link[uuid="' + uuid + '"]');

        if (linkNode) {
            linkNode.setAttribute('title', story.title);
            this.api.events.documentChanged(name, {
                type: 'story',
                action: 'update',
                data: story
            });
        }
        else {
            throw new NotFoundError('Could not find linkNode with UUID: ' + uuid);
        }
    }


    /**
     * Adds a content-profile link to NewsItem
     *
     * @example
     * {
     *  "uuid": "88d36cbe-d6dd-11e5-ab30-625662870761",
     *  "title": "A name"
     * }
     * @param {string} name Name of the plugin
     * @param {object} contentprofile A contentprofile object containing uuid and title
     *
     * @deprecated Use {@link Api.NewsItem#addContentProfile}
     * @fires event.DOCUMENT_CHANGED
     */
    addConceptProfile(name, contentprofile) {
        this.addContentProfile(name, contentprofile)
    }


    /**
     * Adds a content-profile link to NewsItem
     *
     * @example
     * {
     *  "uuid": "88d36cbe-d6dd-11e5-ab30-625662870761",
     *  "title": "A name"
     * }
     * @param {string} name Name of the plugin
     * @param {object} contentprofile A contentprofile object containing uuid and title
     *
     * @fires event.DOCUMENT_CHANGED
     */
    addContentProfile(name, contentprofile) {
        if (this._getLinkByUuid(contentprofile.uuid)) {
            console.info(`Content profile with uuid: ${contentprofile.uuid} already exists`)
            return
        }

        var newsItem = this.api.newsItemArticle;
        var linksNode = newsItem.querySelector('itemMeta > links');
        var linkNode = newsItem.createElementNS(linksNode.namespaceURI, 'link');

        linkNode.setAttribute('title', contentprofile.title);
        linkNode.setAttribute('uuid', contentprofile.uuid);
        linkNode.setAttribute('rel', 'subject');
        linkNode.setAttribute('type', 'x-im/content-profile');

        linksNode.appendChild(linkNode);

        this.api.events.documentChanged(name, {
            type: 'contentprofile',
            action: 'add',
            data: contentprofile
        });
    }

    /**
     * Adds a category link to NewsItem
     *
     * @example
     * {
     *  "uuid": "88d36cbe-d6dd-11e5-ab30-625662870761",
     *  "title": "A name"
     * }
     * @param {string} name Name of the plugin
     * @param {object} category A category object containing uuid and title
     *
     * @fires event.DOCUMENT_CHANGED
     */
    addCategory(name, category) {
        if (this._getLinkByUuid(category.uuid)) {
            console.info(`Category with uuid: ${category.uuid} already exists`)
            return
        }

        var newsItem = this.api.newsItemArticle;
        var linksNode = newsItem.querySelector('itemMeta > links');
        var linkNode = newsItem.createElementNS(linksNode.namespaceURI, 'link');

        linkNode.setAttribute('title', category.title);
        linkNode.setAttribute('uuid', category.uuid);
        linkNode.setAttribute('rel', 'subject');
        linkNode.setAttribute('type', 'x-im/category');

        linksNode.appendChild(linkNode);

        this.api.events.documentChanged(name, {
            type: 'category',
            action: 'add',
            data: category
        });
    }

    /**
     * Updates title on existing story
     *
     * @param {string} name Plugin name
     * @param {object} story A concept profile object that atleast contains title and uuid
     *
     * @fires event.DOCUMENT_CHANGED
     * @deprecated use {@link updateContentProfile}
     * @example
     * {
     *  "uuid": "88d36cbe-d6dd-11e5-ab30-625662870761",
     *  "title": "A name"
     * }
     */
    updateConceptProfile(name, contentprofile) {
        this.updateContentProfile(name, contentprofile)
    }

    /**
     * Updates title on existing story
     *
     * @param {string} name Plugin name
     * @param {object} story A concept profile object that atleast contains title and uuid
     *
     * @fires event.DOCUMENT_CHANGED
     *
     * @example
     * {
     *  "uuid": "88d36cbe-d6dd-11e5-ab30-625662870761",
     *  "title": "A name"
     * }
     */
    updateContentProfile(name, contentprofile) {
        var uuid = contentprofile.uuid;
        var linkNode = this.api.newsItemArticle.querySelector('itemMeta > links > link[uuid="' + uuid + '"]');

        if (linkNode) {
            linkNode.setAttribute('title', contentprofile.title);
            this.api.events.documentChanged(name, {
                type: 'contentprofile',
                action: 'update',
                data: contentprofile
            });
        }
        else {
            throw new NotFoundError('Could not find linkNode with UUID: ' + uuid);
        }
    }


    /**
     *
     * Returns a list of all existing content-profiles in NewsItem
     *
     * @returns {array | null}
     */
    getContentProfiles() {
        var linkNodes = this._getLinksByType('x-im/content-profile');
        if (!linkNodes) {
            return null;
        }

        var links = [];
        var length = linkNodes.length;
        for (var i = 0; i < length; i++) {
            var link = jxon.build(linkNodes[i]);
            var normalizedTag = this.normalizeObject(link);
            links.push(normalizedTag);
        }

        return links;
    }

    /**
     * Returns a conceptItem with matching UUID
     *
     * @returns {object|null} ConceptItem or null
     */
    getConceptByUuid(uuid) {
        const linkNode = this._getLinkByUuid(uuid)
        let link = null

        if (linkNode) {
            link = this.normalizeObject(
                jxon.build(linkNode)
            )
        }

        return link
    }

    /**
     * Returns a list of all existing categories in NewsItem
     *
     * @returns {array | null}
     */
    getCategories() {
        var linkNodes = this._getLinksByType('x-im/category');
        if (!linkNodes) {
            return null;
        }

        var links = [];
        var length = linkNodes.length;
        for (var i = 0; i < length; i++) {
            var link = jxon.build(linkNodes[i]);
            var normalizedTag = this.normalizeObject(link);
            links.push(normalizedTag);
        }

        return links;
    }

    /**
     * Generic method to find different itemMetaExtproperty nodes
     *
     * @private
     * @deprecated 2018-10-11
     *
     * @param {string} imExtType Type of itemMetaExtproprtyNode
     * @returns {Element}
     */
    _getItemMetaExtPropertyByType(imExtType) {
        console.warn('private function _getItemMetaExtPropertyByType() is deprecated, use public function getExtProperty()')
        return this.getExtProperty('itemMeta', imExtType, true)
        // return this.api.newsItemArticle.querySelector(
        //     'itemMeta itemMetaExtProperty[type="' + imExtType + '"]'
        // )
    }

    /**
     * Retrieve either an itemMetaExtProperty or contentMetaExtProperty value
     * from the item or content meta sections. Optionally return full element
     * if raw parameter is set to true.
     *
     * @param {string} sectionName Either 'itemMeta' or 'contentMeta'
     * @param {string} type
     * @param {boolean} raw Optional, return as raw dom element, default is false
     * @return {string|Element}
     */
    getExtProperty(sectionName, type, raw = false) {
        let elementName

        if (sectionName === 'itemMeta') {
            elementName = 'itemMetaExtProperty'
        }
        else if (sectionName === 'contentMeta') {
            elementName = 'contentMetaExtProperty'
        }
        else {
            throw new Error('Either itemMeta or contentMeta section name must be specified')
        }

        const el = this.api.newsItemArticle.querySelector(
            `${sectionName} ${elementName}[type="${type}"]`
        )

        return raw ? el : el.getAttribute('value')
    }

    /**
     * Create new or set a value of existing itemMetaExtProperty or contentMetaExtProperty
     *
     * @param {string} name Identifier of caller
     * @param {string} sectionName Either 'itemMeta' or 'contentMeta'
     * @param {string} type
     * @param {string} value
     */
    setExtProperty(name, sectionName, type, value) {
        let elementName = (sectionName === 'itemMeta') ? 'itemMetaExtProperty' : 'contentMetaExtProperty'

        let el = this.getExtProperty(sectionName, type, true)
        if (el) {
            el.setAttribute('value', value)
        }
        else {
            const sectionEl = this.api.newsItemArticle.querySelector(sectionName)
            el = this.api.newsItemArticle.createElementNS(
                sectionEl.namespaceURI,
                elementName
            )

            el.setAttribute('type', type)
            el.setAttribute('value', value)
            sectionEl.appendChild(el)
        }

        this.api.events.documentChanged(name, {
            type: elementName,
            action: 'set',
            data: jxon.build(el),
            node: el
        });
    }

    /**
     * Delete a specified itemMetaExtProperty or contentMetaExtProperty
     *
     * @param {string} name Identifier of caller
     * @param {string} sectionName Either 'itemMeta' or 'contentMeta'
     * @param {string} type
     */
    deleteExtProperty(name, sectionName, type) {
        let elementName = (sectionName === 'itemMeta') ? 'itemMetaExtProperty' : 'contentMetaExtProperty'

        let el = this.getExtProperty(sectionName, type, true)
        if (el) {
            const obj = jxon.build(el)
            el.parentElement.removeChild(el)

            this.api.events.documentChanged(name, {
                type: elementName,
                action: 'delete',
                data: obj
            })
        }
    }


    /**
     * Get link elements by uuid
     *
     * @param {string} uuid
     * @returns {Element}
     *
     * @private
     */
    _getLinkByUuid(uuid) {
        return this.api.newsItemArticle.querySelector(
            `itemMeta > links > link[uuid="${uuid}"]`
        )
    }

    /**
     * Private method to find signal by qcode
     *
     * @param {string} qcode Ex: sig:update
     * @returns {Element}
     *
     * @private
     */
    _getSignalNodeByQcode(qcode) {
        return this.api.newsItemArticle.querySelector('itemMeta signal[qcode="' + qcode + '"]');
    }


    /**
     * Private method to get links by type
     * @returns {NodeList}
     * @private
     */
    _getLinksByType(type) {
        if (Array.isArray(type)) {
            var queryArr = [];
            type.forEach(function (linkType) {
                queryArr.push('itemMeta > links > link[type="' + linkType + '"]')
            });

            var query = queryArr.join();
            return this.api.newsItemArticle.querySelectorAll(query);
        }
        else {
            return this.api.newsItemArticle.querySelectorAll('itemMeta > links > link[type="' + type + '"]');
        }
    }

    /**
     * Returns the generated temporary id for the article.
     * Temporary id is used when a new article is created and before it's saved the first time.
     * @returns {*|null}
     */
    getTemporaryId() {
        return this.api.app.temporaryArticleID || null
    }

    /**
     * Set a temporaryId for the article
     * @param temporaryArticleID
     */
    setTemporaryId(temporaryArticleID) {
        if (!temporaryArticleID) {
            this.api.app.temporaryArticleID = false
        } else {
            this.api.app.temporaryArticleID = temporaryArticleID
        }

    }

    /**
     * Checks if current article has a temporary id
     * @returns {boolean}
     */
    hasTemporaryId() {
        return this.api.browser.getHash() ? false : true
    }

    /**
     * Get the id for the article
     * @returns {string}
     */
    getIdForArticle() {
        if (this.hasTemporaryId()) {
            return this.getTemporaryId()
        } else {
            return this.getGuid()
        }
    }

    /**
     * Get value of itemMetaExtProperty element with type imext:haspublihedversion that
     * indicates whether the newsitem has published version or not.
     *
     * @return {bool}
     */
    getHasPublishedVersion() {
        let versionNode = this._getItemMetaExtPropertyByType('imext:haspublishedversion')

        if (!versionNode) {
            return false;
        }

        return (versionNode.getAttribute('value') === "true")
    }

    /**
     * Set itemMetaExtProperty element with type imext:haspublihedversion to true/false in item > meta sections
     * to indicate whether this newsitem has a published version or not.
     *
     * @param {string} name  Identifier of caller
     * @param {bool} value True or false
     */
    setHasPublishedVersion(name, value) {
        let versionNode = this._getItemMetaExtPropertyByType('imext:haspublishedversion')

        if (!versionNode) {
            const newsItem = this.api.newsItemArticle,
                itemMetaNode = newsItem.querySelector('itemMeta')

            versionNode = newsItem.createElementNS(itemMetaNode.namespaceURI, 'itemMetaExtProperty')
            itemMetaNode.appendChild(versionNode)
        }

        versionNode.setAttribute('value', value)
        versionNode.setAttribute('type', 'imext:haspublishedversion')

        this.api.events.documentChanged(name, {
            type: 'hasPublishedVersion',
            action: 'set',
            data: value
        })

    }

    /**
     * Retrieve objects from contentmeta.medata section based on type.
     *
     * @param {string} type The type of object
     * @return {Array} Array of objects in jxon format
     *
     */
    getContentMetaObjectsByType(objectType) {
        var nodes = this.api.newsItemArticle.querySelectorAll(
            'contentMeta metadata object[type="' + objectType + '"]'
        )

        if (!nodes || nodes.length === 0) {
            console.warn('Content meta data objects not found: ' + objectType)
            return null
        }

        var jxonObjects = []
        for (var n = 0; n < nodes.length; n++) {
            jxonObjects.push(jxon.build(nodes[n]))
        }

        return jxonObjects
    }

    /**
     * Retrieve object from contentmeta.medata section based on id.
     *
     * @param {string} id The id of object
     * @return {Object} Object in jxon format
     *
     */
    getContentMetaObjectById(id) {
        var node = this.api.newsItemArticle.querySelector(
            'contentMeta metadata object[id="' + id + '"]'
        )

        if (!node) {
            console.warn('Content meta data object not found: ' + id)
            return null
        }

        return jxon.build(node)
    }

    /**
     * Create and add an object into the contentmeta.metadata section.
     * The object is encoded as a jxon object with the mandatory attributes
     * id and type. All data must reside in the sub data structure. If an
     * object with the specified id already exists it is silently replaced.
     * Triggers a document:changed event.
     *
     * @param {string} name Name of the plugin making the call
     * @param {Object} jxonObject The jxon encoded object
     *
     * @fires event.DOCUMENT_CHANGED
     *
     * @example
     * import {api} from 'writer'
     *
     * var idGen = require('writer/utils/IdGenerator');
     *
     * api.newsItem.setContentMetaObject('ximimage', {
     *      '@id': idGen(),
     *      '@type': "x-im/newsvalue",
     *      data: {
     *          score: "2",
     *          description: 'My description',
     *          format: "lifetimecode",
     *          end: "2016-01-31T10:00:00.000+01:00"
     *      }
     * });
     *
     * @example <caption>Results in</caption>
     * <object id="8400c74d665x" type="x-im/newsvalue">
     *     <data>
     *         <score>2</score>
     *         <description>My description</description>
     *         <format>lifetimecode</format>
     *         <end>2016-01-31T10:00:00.000+01:00</end>
     *     </data>
     * </object>
     *
     */
    setContentMetaObject(name, jxonObject) {
        if ('undefined' === typeof jxonObject) {
            throw new Error('Undefined value')
        }

        if (typeof (jxonObject['@id']) === 'undefined') {
            throw new Error('Jxon object missing @id attribute')
        }

        if (typeof (jxonObject['@type']) === 'undefined') {
            throw new Error('Jxon object missing @type attribute')
        }

        var metaDataNode = this.api.newsItemArticle.querySelector('contentMeta metadata'),
            objectNode = this.api.newsItemArticle.querySelector(
                'contentMeta metadata object[id="' + jxonObject['@id'] + '"]'
            )

        if (!metaDataNode) {
            var contentMetaNode = this.api.newsItemArticle.querySelector('contentMeta')
            metaDataNode = this.api.newsItemArticle.createElementNS(contentMetaNode.namespaceURI, 'metadata')
            contentMetaNode.appendChild(metaDataNode)
        }
        else if (objectNode) {
            metaDataNode.removeChild(objectNode)
        }

        objectNode = jxon.unbuild(jxonObject, metaDataNode.namespaceURI, 'object')
        metaDataNode.appendChild(objectNode.childNodes[0])

        this.api.events.documentChanged(name, {
            type: 'contentmetaobject',
            action: 'delete',
            data: jxonObject
        })
    }

    /**
     * Remove a specific object identied by id from the contentmeta.metadata section.
     * Triggers a document:changed event.
     *
     * @fires event.DOCUMENT_CHANGED
     *
     * @param {string} name Name of the plugin making the call
     * @param {string} id The id of the object
     */
    removeContentMetaObject(name, id) {
        var node = this.api.newsItemArticle.querySelector(
            'contentMeta metadata object[id="' + id + '"]'
        )

        if (node) {
            node.parentElement.removeChild(node)

            this.api.events.documentChanged(name, {
                type: 'contentmetaobject',
                action: 'delete',
                data: id
            })
        }
    }

    /**
     * Invalidate document and displays notification that document is invalid
     *
     * @fires event.DOCUMENT_INVALIDATED
     */
    invalidate() {
        this.api.ui.showNotification(
            'invalidate',
            this.api.getLabel("Article is invalid"),
            this.api.getLabel("This article is no longer valid")
        );

        this.api.events.triggerEvent("__internal", Event.DOCUMENT_INVALIDATED, {});
    }

    /**
     * Get version created date. Resides in newsItem > itemMeta block. If no version created
     * date was found, null is returned.
     *
     * @returns {*}
     */
    getVersionCreated() {
        return this._getDate('itemMeta', 'versionCreated')
    }

    /**
     * Get first created date. Resides in newsItem > itemMeta block. If no first created
     * date was found, null is returned.
     *
     * @returns {*}
     */
    getFirstCreated() {
        return this._getDate('itemMeta', 'firstCreated')
    }

    /**
     * Get content created date. Resides in newsItem > contentMeta block. If no content created
     * date was found, null is returned.
     *
     * @returns {*}
     */
    getContentCreated() {
        return this._getDate('contentMeta', 'contentCreated')
    }

    /**
     * Get content modified date. Resides in newsItem > contentMeta block. If no content modified
     * date was found, null is returned.
     *
     * @returns {*}
     */
    getContentModified() {
        return this._getDate('contentMeta', 'contentModified')
    }

    /**
     * Returns date (string). If not found, null is returned.
     *
     * @param parentNode    Parent node of date node.
     * @param nodeName      Node containing date.
     * @returns {*}
     * @private
     */
    _getDate(parentNode, nodeName) {
        const node = this.api.newsItemArticle.querySelector(
            parentNode + ' ' + nodeName
        )

        if (node) {
            return node.textContent
        }
        else {
            return null
        }
    }
}

export default NewsItem

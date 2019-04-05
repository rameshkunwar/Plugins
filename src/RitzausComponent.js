import {Component} from 'substance'
import {UIButton} from 'writer'
import { api, event, idGenerator } from 'writer'
import filterResults from './filter'
import ApiResult from './ApiResultComponent'
import PropertyMap from './PropertyMap'

import {NewsItem} from 'writer'
// import { link } from 'fs';

const apiUrlBase = "https://services.ritzau.dk/ritzaurest/Services.svc/json/news/NewsList"
const MSG_ERROR = "Der opstod en fejl!"
const MSG_NORECORDS="Obs! nyhedes findes ikke"

class RitzausComponent extends Component {

    /**
     * Constructor
     * @param args
     */
    constructor(...args) {
        super(...args)
    }

    /**
     * Method called when component is disposed and removed from DOM
     */
    dispose() {
        // Perfect place to remove eventlisteners etc
    }

    /**
     * Return the inital component state before rendering
     *
     * @returns {{clickCount: number}}
     */
    getInitialState() {
        return {
            //clickCount: 0
            results:[],
            info:''
        }
    }

 

    /**
     * Do something after the first render
     */
    didMount() {
         console.log('Ritzaus plugin rendered')
        //  window.addEventListener('message', this.getMsgFromIframe, false)
          window.addEventListener('message', this.handleJsonData, false)
       
       
        //let msgFromIframe = ""
        // window.addEventListener('message', function(e) {
        //     console.log(e)
        //     msgFromIframe = e.data[1]
        //     console.log(`Message from iFrame: Key: ${e.data[0]} - Value: ${e.data[1]}`)
        // } )

        // const headlineText = document.querySelectorAll('.im-placeholder');
        // if(headlineText !== null){
        //     console.log(headlineText)
        //     let newsML=""
            
        //     $$(api.newsitem.setSource(newsML))
        //     //api.newsitem.setSource(newsML, '', '')
        // }
      
       
    }

    /**
     * Render method is called whenever there's a change in state or props
     *
     * @param $$
     * @returns {*}
     */
    render($$) {

        const {results, info} = this.state
        
        const el = $$('div')
            .addClass('ritzaus-devkit')        

        // const button = $$(UIButton, {
        //     label: this.getLabel('Hente nyheder')
        // })
        //     .on('click', (ev) => {
        //         // this.increaseClickCount()
        //         ev.preventDefault()
        //         this.getNyheder()
        //     })
        //     .ref('button')

        // el.append([
        //     $$('h2').append(
        //         this.getLabel('Ritzaus Nyhedstjeneste plugin loaded')
        //         // this.getLabel('Devkit plugin loaded')
        //     ),
        //     // $$('p').append(
        //     //     this.getLabel('Number of clicks') + `: ${this.state.clickCount}`
        //     // ),
        //     button
        // ])

        const newsFeeds = $$('div')
            .addClass('newsHeadLine3')

        const resultList = $$(ApiResult, {results:results})
        const iframeResult = $$('iframe')
                .setId('9e77b585-3f23-4e31-bbef-e5fda80635d4')
                .css('width','100%')
                .css('height','900px')
                //.attr('src', 'https://ritzau.dk/nyhed/')
                 .attr('src','https://localhost:44301/')                
                .attr('scrolling','yes')
                .attr('frameborder','0')


      //ss newsFeeds.append(resultList)

        const nyhedContainer = $$('div')
            .addClass('newsListBlock') 
            .css('width','100%')               
            .append(
                $$('div')
                    .addClass('newslistcontainer')  
                    .css('overflow-y','hidden') 
                    .css('max-width','100%')
                    .setId('newsListContainer')
                    //.append(resultList)                                                        
                    .append(iframeResult)
            )

        //el.append(nyhedContainer)

       

        el.append(nyhedContainer)

        return el
    }

    //code to handle json
    handleJsonData(event){
        console.log(`Event origin is: ${event.origin}`)
        if(event.origin !== 'https://localhost:44301'){
            return
        }  
        console.log(`Message from iFrame: Key: ${event.data[0]} - Value: ${event.data[1]}`)
        //let's parse json
        let obj = JSON.parse(event.data[1])
        console.log(obj.overskrift)
        console.log(obj.imgurl)
        let url = obj.imgurl 
       

        //use single transaction to insert header, rubrik and body
        //let's create node
        // const overskriftNode = {
        //     parentNodeId: headlineNodeId,
        //     type: 'headline',
        //     content: obj.overskrift,
        //     containerId: 'body',
        //     mode:'first'
        // };
        // let insertNodes = api.doc.getNodes()
        // const rubrikNode = {
        //     id: rubrikNodeId,
        //     type: 'preamble',
        //     content: obj.rubrik,
        //     containerId: 'body',
        //     mode:'after',
        //     refNode:insertNodes.body.nodes[2]
        // }

        let headlineNodeId = idGenerator()
        let rubrikNodeId = idGenerator()
        let bodyNodeId = idGenerator()

        const myapi = api
        api.editorSession.transaction((tx) => {
            // tx.insertBlockNode({
            //     id: headlineNodeId,
            //     type: 'headline',
            //     content: obj.overskrift,
            //     containerId: 'body',
            //     mode:'first'
            // })

            myapi.document.insertBlockNode({
                tx:tx,
                data:{
                    type:'headline',
                    content:obj.overskrift,
                    attribution:''
                }
                
            })



            myapi.document.insertBlockNode({
                tx: tx,
                data: {
                  type: 'preamble',
                  content: obj.rubrik,
                  attribution: ''
                },
                  mode: 'last',
                // refNode: headlineNodeId 
              })

            // tx.insertBlockNode({
               
            //     id:rubrikNodeId,
            //     type: 'preamble',
            //     content: obj.rubrik,
            //     containerId: 'body',
            //     mode:'after',
            //     refNode: headlineNodeId
            // })

            // tx.insertBlockNode({
            //     id: bodyNodeId,
            //     type: 'paragraph',
            //     content: obj.broedtekst,
            //     containerId: 'body',
            //     mode:'after',
            //     refNode: rubrikNodeId
            // })    

            // const imgNodeId = idGenerator()

            // const imageFileNode = {
            //     parentNodeId: imgNodeId,
            //     type: 'npfile',
            //     imType:'x-im/image',
            //     sourceUrl: obj.imgurl,
            //     mode:'last'
            // }
        
            // //create file node for the image
            // const imageFile = tx.create(imageFileNode)
            // //const propertyMap = PropertyMap.getValidMap()

            //  //insert image at current cursor pos
            //  let insertNodes = api.doc.getNodes()
            //  tx.insertBlockNode({
            //     id:imgNodeId,
            //     type:'ximimage',
            //     imageFile:imageFile.id,
            //     alignment:'',
            //     caption:obj.imageTekst,
            //     alttext:'',
            //     credit:'',
            //     mode:imageFile.mode
            // })

            // setTimeout(() => {
            //     api.editorSession.fileManager.sync()
            //     .then(() => {
            //         const imageNode = api.editorSession.getDocument().get(imgNodeId)
            //         imageNode.emit('onImageUploaded')
            //     } )
            //     .catch(() => {
            //         const document = api.editorSession.getDocument()
            //         const node = document.get(imgNodeId)
            //         const imageFile = node.imageFile
    
            //         if(imageFile){
            //             // api.editorSession.transaction((tx) =>{
            //                 tx.delete(imageFile)
            //             // } )
            //         }
            //         api.document.deleteNode('ximimage', node)
            //     })
    
            // }, 0 )
        })

       

        //insert teaser
        
        let nodes = api.doc.getNodes()
        let teaserNode = {}
        let notherTeaserTest=""
        let teaserNodeId = ""
        for(const node in nodes){
            let value = nodes[node]
            if(value.dataType === "x-im/teaser"){
                teaserNodeId = value.id
                console.log("teaserNodeId: "+teaserNodeId)
                Object.assign(value, teaserNode)
                //value.subect = "This is a subject",
                value.text = obj.overskrift,
                value.title = obj.rubrik,
                value.uuid = "bececec2-17a5-419f-aca8-744e0427ba04",
                value.height = "14",
                value.width = "50"
            }
        }

        //end of teaser

            //let's insert image
    //    let paragraphNodeId = idGenerator()

    //    console.log("Before inserting image Nodes",api.doc.getNodes())

    //    api.editorSession.transaction((tx) => {
    //        let surface = api.editorSession.getFocusedSurface()
    //        tx.setSelection({
    //            type: 'node',
    //            nodeId: Object.keys(api.doc.getNodes())[3],//this should be dynamic based on content
    //            mode: 'after',
    //            containerId: surface.getContainerId(),
    //            surfaceId: surface.id
    //        })
    //    })

    //    api.editorSession.transaction((tx) => {
    //        tx.insertBlockNode({
    //            id: paragraphNodeId,
    //            type: 'paragraph',
    //            content: '',
    //            containerId: 'body'                             
    //        })
    //    })

       //api.editorSession.selectNode(paragraphNodeId)
       //console.log("Nodes",api.doc.getNodes())
        //need to do more

       //Executes plugin Ximimage command in XimimagePackage.js config.addCommand('ximimage-insert-image-url', InsertImageUrlCommand)
    //    api.editorSession.executeCommand('ximimage-insert-image-url', {
    //        imageUrl: url
    //    })

    //new insert image code based on archive search plugin

    // const imgNodeId = idGenerator()

    // const imageFileNode = {
    //     parentNodeId: imgNodeId,
    //     type: 'npfile',
    //     imType:'x-im/image',
    //     sourceUrl: obj.imgurl
    // }

    //create file node for the image
    // api.editorSession.transaction((tx) => {
    //     const imageFile = tx.create(imageFileNode)
    //     const propertyMap = PropertyMap.getValidMap()

    //     //insert image at current cursor pos
    //     tx.insertBlockNode({
    //         id:imgNodeId,
    //         type:'ximimage',
    //         imageFile:imageFile.id,
    //         alignment:'',
    //         caption:obj.imageTekst,
    //         alttext:'',
    //         credit:'',
    //         mode:'last'
    //     })

    //     setTimeout(() => {
    //         api.editorSession.fileManager.sync()
    //         .then(() => {
    //             const imageNode = api.editorSession.getDocument().get(imgNodeId)
    //             imageNode.emit('onImageUploaded')
    //         } )
    //         .catch(() => {
    //             const document = api.editorSession.getDocument()
    //             const node = document.get(imgNodeId)
    //             const imageFile = node.imageFile

    //             if(imageFile){
    //                 api.editorSession.transaction((tx) =>{
    //                     tx.delete(imageFile)
    //                 } )
    //             }
    //             api.document.deleteNode('ximimage', node)
    //         })

    //     }, 0 )
    // })


        //let's create teaser
        //let teaserid = idGenerator()

    //#region 
    //     api.editorSession.executeCommand('ximteaser.insert-article',{
    //         data:{
    //             uriData:{
    //                 name:obj.overskrift,
    //                 uuid: teaserid
    //             }
    //         },
    //         context:{
    //             node:api.doc.getNodes()
    //         }
    //    } )
    


    // api.editorSession.transaction((tx) => {
    //     tx.insertBlockNode({
    //         id: teaserid,
    //         type: 'paragraph',
    //         content: '',
    //         containerId: 'body',
    //         caption: "Mudret bund, uklart vand, iltsvind og fiskedød er blandt de konsekvenser, der kan komme, hvis ikke Danmark forbedrer vandmiljøet til det niveau, som er fastsat af EU. (Genrefoto). - foto:Henning Bagger/Ritzau Scanpix" 
           
    //     })
    // })


        // let nodes = api.doc.getNodes()
        // let teaserNode = {}
        // let teaserNodeId = ""
        // for(const node in nodes){
        //     let value = nodes[node]
        //     if(value.dataType === "x-im/teaser"){
        //         teaserNodeId = value.id
        //         Object.assign(value, teaserNode)
        //         // value.subect = "This is a subject",
        //         // value.text = obj.overskrift,
        //         // value.title = obj.rubrik,
        //         // value.uuid = "bececec2-17a5-419f-aca8-744e0427ba04",
        //         // value.height = "12",
        //         // value.width = "20"
        //     }
        // }    

        // api.editorSession.transaction((tx) => {
        //     api.editorSession.executeCommand('ximteaser.insert-article',{
        //         data:{
        //             uriData:{
        //                 name:obj.overskrift,
        //                 uuid: teaserid
        //             }
        //         },
        //         context:{
        //             node:teaserNode
        //         },
        //         tx:tx
        //    } )
        // })
        // api.article.addContentMetadata({           
        //         change:{
        //             id:teaserid,
        //             type:"x-im/teaser",
        //             title: obj.overskrift,
        //             data:{
        //                 subject     :obj.overskrift,
        //                 text        :obj.rubrik
        //             } 
        //         }
           
        //     })

        // api.newsItem.setContentMetaObject('x-im/teaser',{
        //     '@id'   :teaserid,
        //     '@type' :"x-im/teaser",sss
        //     data:{
        //         title:obj.overskrift,
        //         text:obj.rubrik
        //     }
        // } )
           


   

    //    console.log("Nodes",api.doc.getNodes())
    //    let newNodes = api.doc.getNodes()
    //    let parentNodeOfImg =""
    //    for(const node in newNodes){
    //         let value = newNodes[node]
    //         if(value.imType === "x-im/image"){
    //             parentNodeOfImg = value.parentNodeId
    //         }
    //     }



    //    api.editorSession.transaction((tx) => {
    //     tx.insertBlockNode({
    //         id: parentNodeOfImg,
    //         type: 'ximimage',            
    //         caption: '"Mudret bund, uklart vand, iltsvind og fiskedød er blandt de konsekvenser, der kan komme, hvis ikke Danmark forbedrer vandmiljøet til det niveau, som er fastsat af EU. (Genrefoto). - foto:Henning Bagger/Ritzau Scanpix" ',
    //         alttext: '',
    //         credit: 'Henning Bagger',
    //         alignment: '',
    //         width: 0,
    //         height: 0            
    //     })

    //     api.editorSession.transaction((tx) => {
    //         tx.setSelection({
    //             type:node,
    //             containerId: tx.getSelection().containerId,
    //             nodeId: parentNodeOfImg,
    //             mode:'after'
    //         })
    //     } )
   // })

    //#endregion

    }//end of handleJsonData

    

    //this was for handling newsML format
    getMsgFromIframe(event){
        console.log(`Event origin is: ${event.origin}`)
        if(event.origin !== 'https://localhost:44301'){
            return
        }         
        
        console.log(`Message from iFrame: Key: ${event.data[0]} - Value: ${event.data[1]}`)
        const newsML='xyz.xml'
        const apiVar=api
        console.log(apiVar)
        //const newsitem = api.newsItem
        // var parser = new DOMParser();
        // var xmlDoc = parser.parseFromString(event.data[1], "application/xml");
       // var jsonParsedDoc = JSON.parse(event.data[1])

       //let's serialize html doc back to xml
    //    var serializeToXml = new XMLSerializer();
    //    var xmlDoc = serializeToXml.serializeToString(event.data[1])

        apiVar.newsItem.setSource(event.data[1])
        //NewsItem.setSource(newsML, ' ', ' ')


    }

    getNyheder(params ={}){
        this.extendState(Object.assign({}, {result:[]}, params))
        
        const apiUrl = this._getNyhedsUrl()

        api.router.get('/api/resourceproxy', {url:apiUrl})        
            .then(response => api.router.checkForOKStatus(response))
            .then(response => response.json())
            .then(this._handleResult.bind(this))
            .catch((err) => {
                console.error(err)    
                this.extendState({infod:MSG_ERROR})            
            })

    }

    _getNyhedsUrl(){
        const apiUserName = "imws@ritzau.dk"
        const apiPassword = "infomtest1"
        const maxRecord = "30"  
        let newsId ="";      
        return `${apiUrlBase}?user=${apiUserName}&password=${apiPassword}&maksantal=${maxRecord}&newsId=${newsId}`
    }

    _handleResult(json){
        const apiResults = filterResults(json)
        const apiInfo = apiResults.length === 0 ? MSG_NORECORDS : ''
        this.extendState({results:apiResults, info:apiInfo})
    }
    
}

export {RitzausComponent}

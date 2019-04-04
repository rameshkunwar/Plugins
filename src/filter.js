export default(results) => {
    return results.JSONNewsListeResult.ListOfRBNews.filter((item) => {
        if(item.headline === ""){
            return false
        }            
        return true
    } )
}
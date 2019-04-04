import {Component} from 'substance'

class ApiResultItem extends Component{
    render($$){
        const {item} = this.props

        const newsHeadLine =$$('div')
            .addClass('newsHeadLine3')

        const headLineContent= $$('span')
            .html(item.headline)

        newsHeadLine.append(headLineContent)
        return newsHeadLine
    }
}
export default ApiResultItem
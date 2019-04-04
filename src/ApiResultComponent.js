import {Component} from 'substance'
import ApiResultItem from './apiResultItem'

class ApiNewsResultComponent extends Component{
    render($$){
        const el = $$('div')
            .addClass('newsitem')                
        
        const items = this.props.results.map(function(item) {
            return $$(ApiResultItem, {item:item})
        } )

        el.append(items)

        return el
    }
}

export default ApiNewsResultComponent
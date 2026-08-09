import { useLibrary } from '../contexts'
import { Icon, Input } from '../components/atomic'


/**
 * The library search field, hosted by the titlebar.
 *
 * `<search>` is the landmark for it — it carries `role="search"` natively, so
 * no `role` attribute is needed and the field is reachable as a landmark.
 *
 * The collapse-to-an-icon behaviour is pure CSS: `:placeholder-shown` is the
 * "is it empty" test and `:focus-within` the "is it in use" one, so there is
 * no open/closed state here to keep in sync. See `.search-input` in views.css.
 */
export function LibrarySearch () {
  const { searchQuery, setSearchQuery } = useLibrary()

  return <search className='titlebar-search'>
    <Input
      aria-label='Search tracks'
      wrapperClass='search-input'
      type='search'
      placeholder='Search tracks...'
      value={ searchQuery }
      startAdornment={ <Icon name='search' /> }
      onChange={ event =>
        setSearchQuery(event.target.value) } />
  </search>
}

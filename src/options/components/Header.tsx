import logo from '@/assets/img/logo.png'
import { AppName, getExtensionVersion } from '@/utils/utils'

function Header() {
  return (
    <>
      <nav className="options-header">
        <div>
          <div>
            <img src={logo} className="options-header__logo" />
            <strong>
              {AppName} (v
              {getExtensionVersion()})
            </strong>
          </div>
        </div>
      </nav>
    </>
  )
}

export default Header

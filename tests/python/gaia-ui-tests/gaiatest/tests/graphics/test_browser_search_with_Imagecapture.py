# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
import time
from marionette.by import By
import pdb
from gaiatest.apps.search.app import Search
from gaiatest.gaia_graphics_test import GaiaImageCompareTestCase

class TestBrowserSearch(GaiaImageCompareTestCase):
    _google_search_input_locator = (By.NAME, 'q')

    def setUp(self):

        GaiaImageCompareTestCase.setUp(self)
        self.connect_to_network()

        self.data_layer.connect_to_wifi()
        self.apps.set_permission_by_url(Search.manifest_url, 'geolocation', 'deny')

    def test_browser_search(self):

        self.invoke_screen_capture()
        search = Search(self.marionette)
        search.launch()
        pdb.set_trace()
        search_text = 'Mozilla Web QA'
        browser = search.go_to_url(search_text)
        time.sleep(5)
        self.invoke_screen_capture()

    def tearDown(self):
        GaiaImageCompareTestCase.tearDown(self)
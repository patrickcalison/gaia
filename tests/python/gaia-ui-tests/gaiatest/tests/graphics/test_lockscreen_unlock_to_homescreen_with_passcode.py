# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from marionette.wait import Wait

from gaiatest.gaia_graphics_test import GaiaImageCompareTestCase
from gaiatest.apps.lockscreen.app import LockScreen


class TestLockScreen(GaiaImageCompareTestCase):

    _input_passcode = '7931'
    _seconds_since_epoch = 1357043430

    def setUp(self):
        GaiaImageCompareTestCase.setUp(self)
        self.data_layer.set_time(self._seconds_since_epoch * 1000)
        self.data_layer.set_setting('time.timezone', 'Atlantic/Reykjavik')

        #set passcode-lock
        self.data_layer.set_setting('lockscreen.passcode-lock.code', self._input_passcode)
        self.data_layer.set_setting('lockscreen.passcode-lock.enabled', True)

        # this time we need it locked!
        self.device.lock()

    def test_lockscreen_unlock_to_homescreen_with_passcode(self):
        #1st try
        import pdb
        pdb.set_trace()
        #Wait(self.marionette, timeout=30).until(lambda m: self.device.has_mobile_connection)
        self.connect_to_local_area_network()

        lock_screen = LockScreen(self.marionette)
        lock_screen.switch_to_frame()
        lock_screen.unlock_to_passcode_pad()
        self.take_screenshot()
        self.device.turn_screen_off()

        #2nd try
        self.device.turn_screen_on()
        passcode_pad = lock_screen.unlock_to_passcode_pad()
        homescreen = passcode_pad.type_passcode(self._input_passcode)

        Wait(self.marionette).until(lambda m: self.apps.displayed_app.name == homescreen.name)
        self.take_screenshot()

    def tearDown(self):

        GaiaImageCompareTestCase.tearDown(self)
from datetime import datetime

from marionette.wait import Wait

from gaiatest.apps.settings.app import Settings
from gaiatest import GaiaTestCase
from gaiatest.apps.lockscreen.app import LockScreen


class TestLockScreen(GaiaTestCase):

    def setUp(self):
        GaiaTestCase.setUp(self)
        self.connect_to_local_area_network()

    def test_lockscreen_time_check(self):
        """
        https: // bugzilla.mozilla.org / show_bug.cgi?id = 1118054
        """

        self.settings = Settings(self.marionette)
        self.settings.launch()
        datetime_setting = self.settings.open_date_and_time_settings()

        # Auto time update is by default set to true, turn it off to make region change
        datetime_setting.toggle_automatic_time_update()
        self.assertFalse(datetime_setting.is_autotime_enabled, 'Autotime still enabled')

        # record time and change the region.  since no one will be in Atlantic Ocean timezone, change in time
        # will be guaranteed.
        old_time = datetime_setting.get_current_time_text
        datetime_setting.set_region('Atlantic Ocean')

        # get the displayed time after the region change
        new_time = datetime_setting.get_current_time_text
        self.assertNotEqual(new_time, old_time)

        # lock screen and check time on the lockscreen
        self.marionette.switch_to_frame()
        self.device.lock()
        lock_screen = LockScreen(self.marionette)
        self.assertLessEqual(self.get_time_difference(new_time, lock_screen.time), 60)

        # configure to set the time automatically (this will revert the timezone change), then lock screen
        lock_screen.switch_to_frame()
        lock_screen.unlock()
        self.apps.switch_to_displayed_app()

        # Enable the auto time update, so the regions change back and date/time is reverted back
        datetime_setting.toggle_automatic_time_update()
        self.assertTrue(datetime_setting.is_autotime_enabled, 'Autotime still disabled')
        self.marionette.switch_to_frame()
        self.device.lock()

        # wait until device is off and turn back on to check that the time is changed
        Wait(self.marionette, timeout=20).until(
            lambda m: not self.device.is_screen_enabled)
        self.device.turn_screen_on()

        # Check it reverted to the correct time, and compare it with the previously shown time
        # Allow 5 minutes difference max
        self.assertLessEqual(self.get_time_difference(old_time, lock_screen.time), 240)

    def get_time_difference(self, old_time, new_time):
        """
        from the text values, get time difference, returns in seconds.
        both should be in time struct format
        old_time: time from settings
        new_time: time shown on lockscreen
        """
        dt_old_time = datetime.strptime(old_time, '%I:%M %p')
        dt_new_time = datetime.strptime(new_time, '%I:%M %p')

        difference = dt_new_time - dt_old_time
        return difference.seconds # this also works when new_time is on next day

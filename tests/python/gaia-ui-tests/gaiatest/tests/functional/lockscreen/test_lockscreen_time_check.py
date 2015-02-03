from marionette.wait import Wait

from gaiatest.apps.settings.app import Settings
from gaiatest import GaiaTestCase
from gaiatest.apps.lockscreen.app import LockScreen


class TestLockScreen(GaiaTestCase):

    def setUp(self):
        GaiaTestCase.setUp(self)
        self.connect_to_local_area_network()

    def test_lockscreen_time_check(self):

        self.settings = Settings(self.marionette)
        self.settings.launch()
        datetime = self.settings.open_date_and_time_settings()

        # Auto time update is by default set to true, turn it off to make region change
        datetime.change_automatic_time_update(False)

        # record time and change the region
        old_time = datetime.get_current_time_text
        datetime.set_region('Atlantic Ocean')

        # get the displayed time after the region change
        new_time = datetime.get_current_time_text
        self.assertNotEqual(new_time, old_time)

        # lock screen and check time on the lockscreen
        self.marionette.switch_to_frame()
        self.device.lock()
        lock_screen = LockScreen(self.marionette)
        self.assertLessEqual(self.get_time_difference(new_time, lock_screen.time), 1)

        # configure to set the time automatically (this will revert the timezone change), then lock screen
        lock_screen.switch_to_frame()
        lock_screen.unlock()
        self.apps.switch_to_displayed_app()

        # Enable the auto time update, so the regions change back and date/time is reverted back
        datetime.change_automatic_time_update(True)
        self.marionette.switch_to_frame()
        self.device.lock()

        # wait until device is off and turn back on to check that the time is changed
        Wait(self.marionette, timeout=20).until(
            lambda m: not self.device.is_screen_enabled)
        self.device.turn_screen_on()

        # Check it reverted to the correct time, and compare it with the previously shown time
        # Allow 5 minutes difference max
        self.assertLessEqual(self.get_time_difference(old_time, lock_screen.time), 5)


    def get_time_difference(self, time_a, lockscreen_time):
        """
        from the text values, get time difference.  Since lockscreen does not show AM/PM, it is not considered
        time_a: time from settings
        lockscreen_time: time shown on lockscreen
        """
        time_a_hr = int(time_a[0:time_a.find(':')])
        lockscreen_time_hr = int(lockscreen_time[0:lockscreen_time.find(':')])
        time_a_mm = int(time_a[time_a.find(':')+1:time_a.find(' ')])
        lockscreen_time_mm = int(lockscreen_time[lockscreen_time.find(':')+1:])

        if time_a_hr == 12:
            time_a_hr = 0

        if lockscreen_time_hr == 12:
            lockscreen_time_hr = 0

        time_a_converted = time_a_hr * 60 + time_a_mm
        lockscreen_time_converted = lockscreen_time_hr * 60 + lockscreen_time_mm
        difference = lockscreen_time_converted - time_a_converted
        if difference < 0:
            difference += 12*60

        return difference

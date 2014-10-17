# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import datetime

from gaiatest.apps.calendar.app import Calendar
from gaiatest.gaia_graphics_test import GaiaImageCompareTestCase

class TestCalendar(GaiaImageCompareTestCase):

    _seconds_since_epoch = 1357043430

    def setUp(self):
        GaiaImageCompareTestCase.setUp(self)
        self.data_layer.set_time(self._seconds_since_epoch * 1000)

        self.today = datetime.datetime.utcfromtimestamp(self._seconds_since_epoch)
        # Determine the name and the year of the next month
        self.next_month_year = self.today.replace(day=1) + datetime.timedelta(days=32)

    def test_calendar_flick(self):
        """https://bugzilla.mozilla.org/show_bug.cgi?id=937085"""

        MONTH_YEAR_PATTERN = '%b %Y'

        calendar = Calendar(self.marionette)
        calendar.launch()
        self.invoke_screen_capture()

        calendar.flick_to_next_month()
        self.assertEquals(self.next_month_year.strftime(MONTH_YEAR_PATTERN),
                          calendar.current_month_year)
        self.invoke_screen_capture()

        calendar.flick_to_previous_month()
        self.assertEquals(self.today.strftime(MONTH_YEAR_PATTERN), calendar.current_month_year)
        self.invoke_screen_capture()

        calendar.flick_to_previous_month()
        self.invoke_screen_capture()

        calendar.tap_week_display_button()
        self.invoke_screen_capture()
        self.scroll(calendar._week_view_locator,'up',4,distance=600)
        self.invoke_screen_capture()
        self.scroll(calendar._week_view_locator,'down',4,distance=600)
        self.invoke_screen_capture()
        self.scroll(calendar._week_view_locator,'left',1,distance=50)
        self.invoke_screen_capture()
        self.scroll(calendar._week_view_locator,'right',1,distance=50)
        self.scroll(calendar._week_view_locator,'right',1,distance=50)
        self.invoke_screen_capture()

        calendar.tap_day_display_button()
        self.invoke_screen_capture()
        self.scroll(calendar._day_view_locator,'up',4,distance=600)
        self.invoke_screen_capture()
        self.scroll(calendar._day_view_locator,'down',4,distance=600)
        self.invoke_screen_capture()
        self.scroll(calendar._day_view_locator,'left',1,distance=50)
        self.invoke_screen_capture()
        self.scroll(calendar._day_view_locator,'right',1,distance=50)
        self.scroll(calendar._day_view_locator,'right',1,distance=50)
        self.invoke_screen_capture()


    def tearDown(self):

        GaiaImageCompareTestCase.tearDown(self)
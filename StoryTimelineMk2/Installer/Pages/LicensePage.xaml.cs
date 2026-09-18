using System.Windows;
using System.Windows.Controls;

namespace StoryTimelineInstaller.Pages;

public partial class LicensePage : UserControl
{
    private const string LicenseText =
        "GNU GENERAL PUBLIC LICENSE\r\n" +
        "Version 3, 29 June 2007\r\n" +
        "\r\n" +
        "Story Timeline  -  Copyright (C) 2026 WolfyD\r\n" +
        "https://github.com/WolfyD/StoryTimelineMk2\r\n" +
        "\r\n" +
        "This program is free software: you can redistribute it and/or modify\r\n" +
        "it under the terms of the GNU General Public License as published by\r\n" +
        "the Free Software Foundation, either version 3 of the License, or\r\n" +
        "(at your option) any later version.\r\n" +
        "\r\n" +
        "This program is distributed in the hope that it will be useful,\r\n" +
        "but WITHOUT ANY WARRANTY; without even the implied warranty of\r\n" +
        "MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.\r\n" +
        "\r\n" +
        "======================================================================\r\n" +
        "  YOUR RIGHTS UNDER THE GNU GENERAL PUBLIC LICENSE v3\r\n" +
        "======================================================================\r\n" +
        "\r\n" +
        "You are free to:\r\n" +
        "\r\n" +
        "  USE     - Run the program for any purpose.\r\n" +
        "  STUDY   - Access and study the source code.\r\n" +
        "  SHARE   - Redistribute verbatim copies to others.\r\n" +
        "  IMPROVE - Distribute your own modified versions.\r\n" +
        "\r\n" +
        "Under these conditions:\r\n" +
        "\r\n" +
        "  SOURCE  - Copies and derivatives must include the source code or\r\n" +
        "            a written offer to provide it on request.\r\n" +
        "\r\n" +
        "  LICENSE - Copies and derivatives must carry this same GPL v3 license.\r\n" +
        "\r\n" +
        "  NOTICE  - Modified works must carry prominent notices stating that\r\n" +
        "            you changed the files and the date of any changes.\r\n" +
        "\r\n" +
        "  TIVOIZE - You may not use technical measures to prevent recipients\r\n" +
        "            from exercising their rights under this license.\r\n" +
        "\r\n" +
        "======================================================================\r\n" +
        "  WARRANTY DISCLAIMER\r\n" +
        "======================================================================\r\n" +
        "\r\n" +
        "THERE IS NO WARRANTY FOR THE PROGRAM, TO THE EXTENT PERMITTED BY\r\n" +
        "APPLICABLE LAW. EXCEPT WHEN OTHERWISE STATED IN WRITING, THE COPYRIGHT\r\n" +
        "HOLDERS AND/OR OTHER PARTIES PROVIDE THE PROGRAM \"AS IS\" WITHOUT\r\n" +
        "WARRANTY OF ANY KIND, EITHER EXPRESSED OR IMPLIED, INCLUDING, BUT NOT\r\n" +
        "LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR\r\n" +
        "A PARTICULAR PURPOSE. THE ENTIRE RISK AS TO THE QUALITY AND PERFORMANCE\r\n" +
        "OF THE PROGRAM IS WITH YOU. SHOULD THE PROGRAM PROVE DEFECTIVE, YOU\r\n" +
        "ASSUME THE COST OF ALL NECESSARY SERVICING, REPAIR OR CORRECTION.\r\n" +
        "\r\n" +
        "IN NO EVENT UNLESS REQUIRED BY APPLICABLE LAW OR AGREED TO IN WRITING\r\n" +
        "WILL ANY COPYRIGHT HOLDER BE LIABLE TO YOU FOR DAMAGES ARISING FROM\r\n" +
        "THE USE OR INABILITY TO USE THE PROGRAM.\r\n" +
        "\r\n" +
        "======================================================================\r\n" +
        "  FULL LICENSE TEXT\r\n" +
        "======================================================================\r\n" +
        "\r\n" +
        "The complete GNU General Public License v3 is available at:\r\n" +
        "  https://www.gnu.org/licenses/gpl-3.0.txt\r\n" +
        "\r\n" +
        "A copy is also included in the installation directory as LICENSE.txt.\r\n" +
        "\r\n" +
        "Note: The author reserves the right to release future versions of\r\n" +
        "Story Timeline under different license terms. Any version already\r\n" +
        "released under GPL v3 remains under GPL v3.\r\n";

    public LicensePage()
    {
        InitializeComponent();
    }

    public bool IsAccepted => AgreeCheckBox.IsChecked == true;

    private void UserControl_Loaded(object sender, RoutedEventArgs e)
    {
        LicenseTextBox.Text = LicenseText;
    }

    private void AgreeCheckBox_Toggled(object sender, RoutedEventArgs e)
    {
        if (Window.GetWindow(this) is MainWindow mw)
            mw.UpdateFooter();
    }
}

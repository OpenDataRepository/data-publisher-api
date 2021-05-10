'''//////////////////////////////
// Written by: Morteza Najjari //
//         Feb. 2019           //
//    All Rights Reserved      //
//////////////////////////////'''
import csv
import sys
import numpy as np
import json
import math
import matplotlib
import matplotlib.pyplot as plt
import TriboSIML

# matplotlib.use('TkAgg')
from mpl_toolkits.mplot3d import axes3d
from matplotlib.ticker import MaxNLocator


class CommandLineParser:
    def __init__(self):
        self.parent = self
        # self.RollerData = {"0": "10", "1": "10", "2": "20", "3": "2.0e9", "4": "20", "5": "2.0e9", "6": "206000",
        #                 "7": "206000", "8": "0.3", "9": "0.3", "10": "7850", "11": "7850", "12": "460", "13": "460",
        #                 "14": "47", "15": "47", "16": "1.17e-5", "17": "1.17e-5", "18": "40", "19": "40", "20": "2.2",
        #                 "21": "1.8", "22": "2.2", "23": "1.8", "24": "2.0e9", "25": "2.0e9", "26": "C", "27": "",
        #                 "28": ""}
        # self.DentData = {"0": "NoDent", "1": "", "2": "", "3": "", "4": "", "5": "", "6": "", "7": ""}
        #
        # self.LubData = {"0": "Nw", "1": "N", "2": "40", "3": "100","4": "0.1749", "5": "0.01742", "6": "2.273e-8",
        #             "7": "1.614e-8", "8": "", "9": "", "10": "", "11": "", "12": "0.0411", "13": "1880",
        #             "14": "0.14", "15": "890", "16": "6.4e-4", "17": "300", "18": "1500","19": "5"}
        #
        # self.SysData = {"0": "0", "1": "0.15", "2": "5720", "3": "0", "4": "128", "5": "64", "6": "32", "7": "2.5",
        #             "8": "1.5", "9": "3", "10": "F", "11": "N", "12": "N", "13": "N", "14": "filename",
        #             "15": "0.1", "16": "0.0", "17": "3.0", "18": "200", "19": "500"}
        #
        # self.EHLres = {"0": "", "1": "", "2": ""}

        self.data = json.loads(sys.argv[1])
        self.RollerData = self.data['RollerData']
        self.DentData = self.data['DentData']
        self.LubData = self.data['LubData']
        self.SysData = self.data['SysData']
        self.EHLres = self.data['EHLres']
        self.command = sys.argv[2]
        # self.command = 'CalDryCont'

        self.CommandToRun = self.GetProperCommand()

        self.CommandToRun(self)

    def GetProperCommand(self):
        if self.command == 'CalDryCont':
            return SetInpFrame.CalDryCont
        elif self.command == 'CalEHLCont':
            return LubInpFrame.CalEhlCont
        elif self.command == 'CalEHLBatch':
            return LubInpFrame.CalEhlBatch


class SetInpFrame(CommandLineParser):
    def __init__(self, parent):
        super().__init__()
        self.parent = parent

    def CalDryCont(self):
        RollerIN = []
        for i in range(26):
            RollerIN.append(float(self.parent.RollerData[str(i)]))
        RollerIN.append(self.parent.RollerData['26'])
        RollerIN.append(self.parent.RollerData['27'])
        RollerIN.append(self.parent.RollerData['28'])

        DentIN = []
        DentIN.append(self.parent.DentData['0'])
        DentIN.append(float(self.parent.DentData['1'] or 0))
        DentIN.append(float(self.parent.DentData['2'] or 0))
        DentIN.append(float(self.parent.DentData['3'] or 0))
        DentIN.append(float(self.parent.DentData['4'] or 0))
        DentIN.append(float(self.parent.DentData['5'] or 0))
        DentIN.append(self.parent.DentData['6'])
        DentIN.append(self.parent.DentData['7'])

        SysIN = []
        SysIN.append(float(self.parent.SysData['0']))
        SysIN.append(float(self.parent.SysData['1']))
        SysIN.append(float(self.parent.SysData['2']))
        SysIN.append(float(self.parent.SysData['3']))
        SysIN.append(
            int(math.pow(2, math.ceil(math.log(int(self.parent.SysData['4']), 2)))))  # Make sure Nx is power of 2
        SysIN.append(int(math.pow(2, math.ceil(math.log(int(self.parent.SysData['5']), 2)))))
        SysIN.append(int(math.pow(2, math.ceil(math.log(int(self.parent.SysData['6']), 2)))))
        SysIN.append(float(self.parent.SysData['7']))
        SysIN.append(float(self.parent.SysData['8']))
        SysIN.append(float(self.parent.SysData['9']))
        SysIN.append(self.parent.SysData['10'])
        SysIN.append(self.parent.SysData['11'])
        SysIN.append(self.parent.SysData['12'])
        SysIN.append(self.parent.SysData['13'])
        SysIN.append(self.parent.SysData['14'])
        SysIN.append(float(self.parent.SysData['15']))
        SysIN.append(float(self.parent.SysData['16']))
        SysIN.append(float(self.parent.SysData['17']))
        SysIN.append(float(self.parent.SysData['18']))
        SysIN.append(float(self.parent.SysData['19']))

        res, Xp, Yp, Zp, Pr, IniZ, DefZ, RghZ, Bins, Pdf, Sxz, Stmax = TriboSIML.DryContact(RollerIN, DentIN, SysIN)

        self.parent.SysData['2'] = format(res[5], '.1f')
        self.parent.SysData['3'] = format(res[6], '.1f')

        nXp = SysIN[4]
        nYp = SysIN[5]
        nZp = SysIN[6]
        Pr2 = np.array(Pr).reshape((nXp, nYp)).tolist()
        IniZ2 = np.array(IniZ).reshape((nXp, nYp)).tolist()
        DefZ2 = np.array(DefZ).reshape((nXp, nYp)).tolist()
        RghZ2 = np.array(RghZ).reshape((nXp, nYp)).tolist()
        json_dict = {'x-axis': Xp, 'y-axis': Yp, 'pressure': Pr2, 'initial': IniZ2, 'deform': DefZ2,
                     'Roughness': RghZ2}

        print(json.dumps(json_dict))
        return

        # with open('surface_roughness.csv', 'w+') as myCsv:
        #     csvWriter = csv.writer(myCsv, delimiter=',')
        #     csvWriter.writerows(RghZ2)
        #     myCsv.close()
        # y2, x2 = np.meshgrid(Yp, Xp)

        # figCP = plt.figure()
        # axCP = figCP.add_subplot(111, projection='3d')
        # axCP.plot_surface(x2, y2, Pr2, rstride=2, cstride=2, cmap=plt.get_cmap('jet'), linewidth=0.5,
        #                   edgecolor=(0, 0, 0))
        # axCP.set_xlabel('Rolling Direction (mm)')
        # axCP.set_ylabel('Axial Direction (mm)')
        # axCP.set_zlabel('Contact Pressure (MPa)')
        # figCP.canvas.set_window_title('Contact Pressure')
        # figCP.tight_layout()
        #
        # figIP = plt.figure()
        # axIP = figIP.add_subplot(111, projection='3d')
        # axIP.plot_surface(x2, y2, IniZ2, rstride=2, cstride=2, cmap=plt.get_cmap('jet'), linewidth=0.5,
        #                   edgecolor=(0, 0, 0))
        # axIP.set_xlabel('Rolling Direction (mm)')
        # axIP.set_ylabel('Axial Direction (mm)')
        # axIP.set_zlabel('Initial Separation (mm)')
        # figIP.canvas.set_window_title('Initial Separation')
        # figIP.tight_layout()
        #
        # figDS = plt.figure()
        # axDS = figDS.add_subplot(111, projection='3d')
        # axDS.plot_surface(x2, y2, DefZ2, rstride=2, cstride=2, cmap=plt.get_cmap('jet'), linewidth=0.5,
        #                   edgecolor=(0, 0, 0))
        # axDS.set_xlabel('Rolling Direction (mm)')
        # axDS.set_ylabel('Axial Direction (mm)')
        # axDS.set_zlabel('Deformed Surface (mm)')
        # figDS.canvas.set_window_title('Deformed Surface')
        # figDS.tight_layout()
        #
        # if (SysIN[11] == 'Y'):
        #     Sxz2 = np.array(Sxz).reshape((nZp, nXp))
        #     Stmax2 = np.array(Stmax).reshape((nZp, nXp))
        #
        #     tSXZ = np.linspace(Sxz2.min(), Sxz2.max(), 20, endpoint=True)
        #     figSXZ = plt.figure()
        #     axSXZ = figSXZ.add_subplot(111)
        #     axSXZ.contour(Xp, Zp, Sxz2, tSXZ, linewidths=0.5, colors='k')
        #     mappable = axSXZ.contourf(Xp, Zp, Sxz2, tSXZ, cmap=plt.get_cmap('jet'))
        #     axSXZ.set_title('Shear Stress XZ (MPa)')
        #     axSXZ.set_xlabel('X (mm)')
        #     axSXZ.set_ylabel('Z (mm)')
        #     axSXZ.invert_yaxis()
        #     figSXZ.colorbar(mappable, ticks=tSXZ)
        #     figSXZ.canvas.set_window_title('Contour - Shear Stress XZ')
        #
        #     tTMX = np.linspace(Stmax2.min(), Stmax2.max(), 20, endpoint=True)
        #     figTMX = plt.figure()
        #     axTMX = figTMX.add_subplot(111)
        #     axTMX.contour(Xp, Zp, Stmax2, tTMX, linewidths=0.5, colors='k')
        #     mappable = axTMX.contourf(Xp, Zp, Stmax2, tTMX, cmap=plt.get_cmap('jet'))
        #     axTMX.set_title('Maximum Shear Stress (MPa)')
        #     axTMX.set_xlabel('X (mm)')
        #     axTMX.set_ylabel('Z (mm)')
        #     axTMX.invert_yaxis()
        #     figTMX.colorbar(mappable, ticks=tTMX)
        #     figTMX.canvas.set_window_title('Contour - Maximum Shear Stress')

        # figRGH = plt.figure()
        # figRGH.canvas.set_window_title('Garbage')
        # axRGH = figRGH.add_subplot(111)
        # axRGH.pcolor(RghZ2)
        # figRGH.tight_layout()

        # figPDF = plt.figure()
        # figPDF.canvas.set_window_title('Portable dumb format')
        # axPDF = figPDF.add_subplot(111)
        # axPDF.plot(Bins, Pdf)
        # figPDF.tight_layout()



class LubInpFrame(CommandLineParser):

    def __init__(self, parent):
        super().__init__()
        self.parent = parent

    def setEntAct(self):
        if (self.parent.LubData[0] == 'Nw'):
            self.parent.LubData[8].set('')
            self.parent.LubData[9].set('')
            self.parent.LubData[10].set('')
            self.parent.LubData[11].set('')
            # self.Emg1.configure(state='readonly')
            # self.Emg2.configure(state='readonly')
            # self.Esf1.configure(state='readonly')
            # self.Esf2.configure(state='readonly')

        if (self.parent.LubData[0] == 'NNw'):
            self.parent.LubData[8].set('5.0e-5')
            self.parent.LubData[9].set('5.0e-5')
            self.parent.LubData[10].set('0.6')
            self.parent.LubData[11].set('0.99')
            # self.Emg1.configure(state='normal')
            # self.Emg2.configure(state='normal')
            # self.Esf1.configure(state='normal')
            # self.Esf2.configure(state='normal')

    def CalEhlCont(self):
        RollerIN = []
        for i in range(26):
            RollerIN.append(float(self.parent.RollerData[i]))
        RollerIN.append(self.parent.RollerData[26])
        RollerIN.append(self.parent.RollerData[27])
        RollerIN.append(self.parent.RollerData[28])

        DentIN = []
        DentIN.append(self.parent.DentData[0])
        DentIN.append(float(self.parent.DentData[1] or 0))
        DentIN.append(float(self.parent.DentData[2] or 0))
        DentIN.append(float(self.parent.DentData[3] or 0))
        DentIN.append(float(self.parent.DentData[4] or 0))
        DentIN.append(float(self.parent.DentData[5] or 0))
        DentIN.append(self.parent.DentData[6])
        DentIN.append(self.parent.DentData[7])

        SysIN = []
        SysIN.append(float(self.parent.SysData[0]))
        SysIN.append(float(self.parent.SysData[1]))
        SysIN.append(float(self.parent.SysData[2]))
        SysIN.append(float(self.parent.SysData[3]))
        SysIN.append(
            int(math.pow(2, math.ceil(math.log(int(self.parent.SysData[4]), 2)))))  # Make sure Nx is power of 2
        SysIN.append(int(math.pow(2, math.ceil(math.log(int(self.parent.SysData[5]), 2)))))
        SysIN.append(int(math.pow(2, math.ceil(math.log(int(self.parent.SysData[6]), 2)))))
        SysIN.append(float(self.parent.SysData[7]))
        SysIN.append(float(self.parent.SysData[8]))
        SysIN.append(float(self.parent.SysData[9]))
        SysIN.append(self.parent.SysData[10])
        SysIN.append(self.parent.SysData[11])
        SysIN.append(self.parent.SysData[12])
        SysIN.append(self.parent.SysData[13])
        SysIN.append(self.parent.SysData[14])
        SysIN.append(float(self.parent.SysData[15]))
        SysIN.append(float(self.parent.SysData[16]))
        SysIN.append(float(self.parent.SysData[17]))
        SysIN.append(float(self.parent.SysData[18]))
        SysIN.append(float(self.parent.SysData[19]))

        LubIN = []
        LubIN.append(self.parent.LubData[0])
        LubIN.append(self.parent.LubData[1])
        LubIN.append(float(self.parent.LubData[2]))
        LubIN.append(float(self.parent.LubData[3]))
        LubIN.append(float(self.parent.LubData[4]))
        LubIN.append(float(self.parent.LubData[5]))
        LubIN.append(float(self.parent.LubData[6]))
        LubIN.append(float(self.parent.LubData[7]))
        LubIN.append(float(self.parent.LubData[8] or 0))
        LubIN.append(float(self.parent.LubData[9] or 0))
        LubIN.append(float(self.parent.LubData[10] or 0))
        LubIN.append(float(self.parent.LubData[11] or 0))
        LubIN.append(float(self.parent.LubData[12]))
        LubIN.append(float(self.parent.LubData[13]))
        LubIN.append(float(self.parent.LubData[14]))
        LubIN.append(float(self.parent.LubData[15]))
        LubIN.append(float(self.parent.LubData[16]))
        LubIN.append(float(self.parent.LubData[17]))
        LubIN.append(float(self.parent.LubData[18]))
        LubIN.append(int(self.parent.LubData[19]))

        res, Xp, Yp, Zp, RghZ, Pehl, Fth, Fst, Tmean, Tmax, Sxz, Stmax, lfrc, fthave, aspratio = TriboLib.EhlContact(
            RollerIN, DentIN, SysIN, LubIN)

        self.parent.SysData[2] = format(res[5], '.1f')
        self.parent.SysData[3] = format(res[6], '.1f')

        self.parent.EHLres[0] = format(lfrc, '.3f')
        self.parent.EHLres[1] = format(fthave * 1000.0, '.3f')
        self.parent.EHLres[2] = format(aspratio, '.2f')

        nXp = SysIN[4]
        nYp = SysIN[5]
        nZp = SysIN[6]
        RghZ2 = np.array(RghZ).reshape((nXp, nYp))
        Pehl2 = np.array(Pehl).reshape((nXp, nYp))
        Fth2 = np.array(Fth).reshape((nXp, nYp))
        Fst2 = np.array(Fst).reshape((nXp, nYp))
        Tmean2 = np.array(Tmean).reshape((nXp, nYp))
        Tmax2 = np.array(Tmax).reshape((nXp, nYp))
        y2, x2 = np.meshgrid(Yp, Xp)

        figRGH = plt.figure()
        axRGH = figRGH.add_subplot(111, projection='3d')
        axRGH.plot_surface(x2, y2, RghZ2, rstride=2, cstride=2, cmap=plt.get_cmap('jet'), linewidth=0.5,
                           edgecolor=(0, 0, 0))
        axRGH.set_zlim(10.0 * RghZ2.min(), 10.0 * RghZ2.max())
        axRGH.set_xlabel('Rolling Direction (mm)')
        axRGH.set_ylabel('Axial Direction (mm)')
        axRGH.set_zlabel('Surface Roughness (micron)')
        figRGH.canvas.set_window_title('Surface Roughness')
        figRGH.tight_layout()

        figEP = plt.figure()
        axEP = figEP.add_subplot(111, projection='3d')
        axEP.plot_surface(x2, y2, Pehl2, rstride=2, cstride=2, cmap=plt.get_cmap('jet'), linewidth=0.5,
                          edgecolor=(0, 0, 0))
        axEP.set_xlabel('Rolling Direction (mm)')
        axEP.set_ylabel('Axial Direction (mm)')
        axEP.set_zlabel('EHL Pressure (MPa)')
        figEP.canvas.set_window_title('EHL Pressure')
        figEP.tight_layout()

        figTH = plt.figure()
        axTH = figTH.add_subplot(111, projection='3d')
        axTH.plot_surface(x2, y2, Fth2, rstride=2, cstride=2, cmap=plt.get_cmap('jet'), linewidth=0.5,
                          edgecolor=(0, 0, 0))
        axTH.set_xlabel('Rolling Direction (mm)')
        axTH.set_ylabel('Axial Direction (mm)')
        axTH.set_zlabel('Film Thickness (micron)')
        figTH.canvas.set_window_title('Film Thickness')
        figTH.tight_layout()

        figFST = plt.figure()
        axFST = figFST.add_subplot(111, projection='3d')
        axFST.plot_surface(x2, y2, Fst2, rstride=2, cstride=2, cmap=plt.get_cmap('jet'), linewidth=0.5,
                           edgecolor=(0, 0, 0))
        axFST.set_xlabel('Rolling Direction (mm)')
        axFST.set_ylabel('Axial Direction (mm)')
        axFST.set_zlabel('Friction Shear (MPa)')
        figFST.canvas.set_window_title('Friction Shear')
        figFST.tight_layout()

        Fth3 = Fth2.T
        tTHC = np.linspace(Fth3.min(), Fth3.max(), 20, endpoint=True)
        figTHC = plt.figure()
        axTHC = figTHC.add_subplot(111)
        axTHC.contour(Xp, Yp, Fth3, tTHC, linewidths=0.5, colors='k')
        mappable = axTHC.contourf(Xp, Yp, Fth3, tTHC, cmap=plt.get_cmap('jet'))
        axTHC.set_title('Film Thickness (micron)')
        axTHC.set_xlabel('Rolling Direction (mm)')
        axTHC.set_ylabel('Axial Direction (mm)')
        figTHC.colorbar(mappable, ticks=tTHC)
        figTHC.canvas.set_window_title('Contour - Film Thickness')

        Fthcen = []
        for i in range(nXp):
            Fthcen.append(Fth2[i][nYp // 2])
        figTHM = plt.figure()
        axTHM = figTHM.add_subplot(111)
        axTHM.plot(Xp, Fthcen)
        axTHM.set_xlabel('Rolling Direction (mm)')
        axTHM.set_ylabel('Film Thickness (micron)')
        figTHM.canvas.set_window_title('Film Thickness')
        figTHM.tight_layout()

        figTAV = plt.figure()
        axTAV = figTAV.add_subplot(111, projection='3d')
        axTAV.plot_surface(x2, y2, Tmean2, rstride=2, cstride=2, cmap=plt.get_cmap('jet'), linewidth=0.5,
                           edgecolor=(0, 0, 0))
        axTAV.set_xlabel('Rolling Direction (mm)')
        axTAV.set_ylabel('Axial Direction (mm)')
        axTAV.set_zlabel('Average Temperature (C)')
        figTAV.canvas.set_window_title('Fluid Temperature - Average')
        figTAV.tight_layout()

        figTMAX = plt.figure()
        axTMAX = figTMAX.add_subplot(111, projection='3d')
        axTMAX.plot_surface(x2, y2, Tmax2, rstride=2, cstride=2, cmap=plt.get_cmap('jet'), linewidth=0.5,
                            edgecolor=(0, 0, 0))
        axTMAX.set_xlabel('Rolling Direction (mm)')
        axTMAX.set_ylabel('Axial Direction (mm)')
        axTMAX.set_zlabel('Maximum Temperature (C)')
        figTMAX.canvas.set_window_title('Fluid Temperature - Maximum')
        figTMAX.tight_layout()

        if (SysIN[11] == 'Y'):
            Sxz2 = np.array(Sxz).reshape((nZp, nXp))
            Stmax2 = np.array(Stmax).reshape((nZp, nXp))

            tSXZ = np.linspace(Sxz2.min(), Sxz2.max(), 20, endpoint=True)
            figSXZ = plt.figure()
            axSXZ = figSXZ.add_subplot(111)
            axSXZ.contour(Xp, Zp, Sxz2, tSXZ, linewidths=0.5, colors='k')
            mappable = axSXZ.contourf(Xp, Zp, Sxz2, tSXZ, cmap=plt.get_cmap('jet'))
            axSXZ.set_title('Shear Stress XZ (MPa)')
            axSXZ.set_xlabel('X (mm)')
            axSXZ.set_ylabel('Z (mm)')
            axSXZ.invert_yaxis()
            figSXZ.colorbar(mappable, ticks=tSXZ)
            figSXZ.canvas.set_window_title('Contour - Shear Stress XZ')

            tTUX = np.linspace(Stmax2.min(), Stmax2.max(), 20, endpoint=True)
            figTUX = plt.figure()
            axTUX = figTUX.add_subplot(111)
            axTUX.contour(Xp, Zp, Stmax2, tTUX, linewidths=0.5, colors='k')
            mappable = axTUX.contourf(Xp, Zp, Stmax2, tTUX, cmap=plt.get_cmap('jet'))
            axTUX.set_title('Maximum Shear Stress (MPa)')
            axTUX.set_xlabel('X (mm)')
            axTUX.set_ylabel('Z (mm)')
            axTUX.invert_yaxis()
            figTUX.colorbar(mappable, ticks=tTUX)
            figTUX.canvas.set_window_title('Contour - Maximum Shear Stress')

        plt.show()

    def CalEhlBatch(self):
        RollerIN = []
        for i in range(26):
            RollerIN.append(float(self.parent.RollerData[i]))
        RollerIN.append(self.parent.RollerData[26])
        RollerIN.append(self.parent.RollerData[27])
        RollerIN.append(self.parent.RollerData[28])

        DentIN = []
        DentIN.append(self.parent.DentData[0])
        DentIN.append(float(self.parent.DentData[1] or 0))
        DentIN.append(float(self.parent.DentData[2] or 0))
        DentIN.append(float(self.parent.DentData[3] or 0))
        DentIN.append(float(self.parent.DentData[4] or 0))
        DentIN.append(float(self.parent.DentData[5] or 0))
        DentIN.append(self.parent.DentData[6])
        DentIN.append(self.parent.DentData[7])

        SysIN = []
        SysIN.append(float(self.parent.SysData[0]))
        SysIN.append(float(self.parent.SysData[1]))
        SysIN.append(float(self.parent.SysData[2]))
        SysIN.append(float(self.parent.SysData[3]))
        SysIN.append(
            int(math.pow(2, math.ceil(math.log(int(self.parent.SysData[4]), 2)))))  # Make sure Nx is power of 2
        SysIN.append(int(math.pow(2, math.ceil(math.log(int(self.parent.SysData[5]), 2)))))
        SysIN.append(int(math.pow(2, math.ceil(math.log(int(self.parent.SysData[6]), 2)))))
        SysIN.append(float(self.parent.SysData[7]))
        SysIN.append(float(self.parent.SysData[8]))
        SysIN.append(float(self.parent.SysData[9]))
        SysIN.append(self.parent.SysData[10])
        SysIN.append(self.parent.SysData[11])
        SysIN.append(self.parent.SysData[12])
        SysIN.append(self.parent.SysData[13])
        SysIN.append(self.parent.SysData[14])
        SysIN.append(float(self.parent.SysData[15]))
        SysIN.append(float(self.parent.SysData[16]))
        SysIN.append(float(self.parent.SysData[17]))
        SysIN.append(float(self.parent.SysData[18]))
        SysIN.append(float(self.parent.SysData[19]))

        LubIN = []
        LubIN.append(self.parent.LubData[0])
        LubIN.append(self.parent.LubData[1])
        LubIN.append(float(self.parent.LubData[2]))
        LubIN.append(float(self.parent.LubData[3]))
        LubIN.append(float(self.parent.LubData[4]))
        LubIN.append(float(self.parent.LubData[5]))
        LubIN.append(float(self.parent.LubData[6]))
        LubIN.append(float(self.parent.LubData[7]))
        LubIN.append(float(self.parent.LubData[8] or 0))
        LubIN.append(float(self.parent.LubData[9] or 0))
        LubIN.append(float(self.parent.LubData[10] or 0))
        LubIN.append(float(self.parent.LubData[11] or 0))
        LubIN.append(float(self.parent.LubData[12]))
        LubIN.append(float(self.parent.LubData[13]))
        LubIN.append(float(self.parent.LubData[14]))
        LubIN.append(float(self.parent.LubData[15]))
        LubIN.append(float(self.parent.LubData[16]))
        LubIN.append(float(self.parent.LubData[17]))
        LubIN.append(float(self.parent.LubData[18]))
        LubIN.append(int(self.parent.LubData[19]))

        aX, Xp, Pehl, Fth, Tmean = TriboLib.EhlBatch(RollerIN, DentIN, SysIN, LubIN)

        nL = LubIN[19]
        nX = SysIN[4]
        Xp2 = np.array(Xp).reshape((nL, nX))
        Pehl2 = np.array(Pehl).reshape((nL, nX))
        Fth2 = np.array(Fth).reshape((nL, nX))
        Tmean2 = np.array(Tmean).reshape((nL, nX))

        Prlvl = []
        for i in range(nL):
            Prlvl.append(LubIN[17] + i * (LubIN[18] - LubIN[17]) / (LubIN[19] - 1))

        figEP = plt.figure()
        axEP = figEP.add_subplot(111)
        for i in range(nL):
            axEP.plot(Xp2[i], Pehl2[i], label='P={:.0f}'.format(Prlvl[i]))
        axEP.set_xlabel('Rolling Direction (mm)')
        axEP.set_ylabel('EHL Pressure (MPa)')
        axEP.legend(loc=2, ncol=1)
        figEP.canvas.set_window_title('EHL Pressure')
        figEP.tight_layout()

        figTH = plt.figure()
        axTH = figTH.add_subplot(111)
        for i in range(nL):
            axTH.plot(Xp2[i], Fth2[i], label='P={:.0f}'.format(Prlvl[i]))
        axTH.set_xlim([-1.2 * aX, 1.2 * aX])
        axTH.set_ylim([0.0, 0.0025])
        axTH.set_xlabel('Rolling Direction (mm)')
        axTH.set_ylabel('Film Thickness (micron)')
        axTH.legend(loc=3, ncol=1)
        figTH.canvas.set_window_title('Film Thickness')
        figTH.tight_layout()

        figTAV = plt.figure()
        axTAV = figTAV.add_subplot(111)
        for i in range(nL):
            axTAV.plot(Xp2[i], Tmean2[i], label='P={:.0f}'.format(Prlvl[i]))
        axTAV.set_xlabel('Rolling Direction (mm)')
        axTAV.set_ylabel('Average Temperature (C)')
        axTAV.legend(loc=2, ncol=1)
        figTAV.canvas.set_window_title('Fluid Temperature - Average')
        figTAV.tight_layout()

        plt.show()


if __name__ == '__main__':
    CommandLineParser()

      # "CalDryCont"
